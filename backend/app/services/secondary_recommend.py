"""Recommend secondary images from how past packages were assembled."""

import random
from collections import defaultdict
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Asset, ContentPackage, TagCatalog

TARGET_COUNT = 10
TEAM_TAG = "团队介绍"
FILL_PRIORITY = ("施工流程", TEAM_TAG)
BENEFIT_SAMPLE = 5
IP_SAMPLE = 8
MIN_BENEFIT_PACKAGES = 2
DEFAULT_RECIPE = (
    (TEAM_TAG, 3.0),
    ("施工流程", 5.0),
    ("清单式报价", 1.0),
    ("装修案例风格", 1.0),
)


@dataclass
class RecommendResult:
    asset_ids: list[int]
    summary: str
    matched_benefit: bool


def recommend_secondaries(db: Session, ip_name: str, benefit_point: str) -> RecommendResult:
    ip_name = ip_name.strip()
    benefit_point = benefit_point.strip()
    if not ip_name:
        raise HTTPException(status_code=400, detail="请先选择 IP")

    kinds = {row.name: row.kind for row in db.scalars(select(TagCatalog)).all()}
    assets = list(db.scalars(select(Asset).where(Asset.type == "secondary")).all())
    candidates = [asset for asset in assets if _has_ip(asset, ip_name, kinds)]
    if not candidates:
        return RecommendResult([], "当前 IP 下没有可用次图", False)

    packages = list(
        db.scalars(
            select(ContentPackage)
            .where(ContentPackage.ip_name == ip_name)
            .order_by(ContentPackage.id.desc())
        ).all()
    )
    usable = [pkg for pkg in packages if list(pkg.secondary_asset_ids or [])]
    benefit_hits = [pkg for pkg in usable if benefit_point and pkg.benefit_point == benefit_point]
    matched_benefit = bool(benefit_point) and len(benefit_hits) >= MIN_BENEFIT_PACKAGES
    sample = benefit_hits[:BENEFIT_SAMPLE] if matched_benefit else usable[:IP_SAMPLE]

    by_id = {asset.id: asset for asset in candidates}
    averages, positions = _tag_profile(sample, by_id, kinds)
    if not averages:
        averages = {tag: weight for tag, weight in DEFAULT_RECIPE}
        positions = {tag: [index] for index, (tag, _) in enumerate(DEFAULT_RECIPE)}

    available = _available_counts(candidates, kinds)
    quotas = _scale_quotas(averages, available)
    order = _tag_order(quotas, positions)

    chosen: list[int] = []
    chosen_set: set[int] = set()
    picked_counts: dict[str, int] = {}
    for tag in order:
        pool = _pool(candidates, kinds, tag, chosen_set)
        for asset in _sample(pool, quotas[tag]):
            chosen.append(asset.id)
            chosen_set.add(asset.id)
            picked_counts[tag] = picked_counts.get(tag, 0) + 1

    if len(chosen) < TARGET_COUNT:
        rest = [asset for asset in candidates if asset.id not in chosen_set]
        buckets: dict[int, list[Asset]] = defaultdict(list)
        for asset in rest:
            tag = _content_tag(asset, kinds)
            priority = FILL_PRIORITY.index(tag) if tag in FILL_PRIORITY else len(FILL_PRIORITY)
            buckets[priority].append(asset)
        for priority in sorted(buckets):
            for asset in _sample(buckets[priority], len(buckets[priority])):
                if len(chosen) >= TARGET_COUNT:
                    break
                tag = _content_tag(asset, kinds)
                chosen.append(asset.id)
                chosen_set.add(asset.id)
                picked_counts[tag] = picked_counts.get(tag, 0) + 1

    return RecommendResult(chosen, _summary(chosen, picked_counts, matched_benefit), matched_benefit)


def _has_ip(asset: Asset, ip_name: str, kinds: dict[str, str]) -> bool:
    return any(tag == ip_name and kinds.get(tag) == "ip" for tag in asset.category_tags or [])


def _content_tag(asset: Asset, kinds: dict[str, str]) -> str:
    for tag in asset.category_tags or []:
        if kinds.get(tag) == "content":
            return tag
    return ""


def _pool(candidates: list[Asset], kinds: dict[str, str], tag: str, chosen: set[int]) -> list[Asset]:
    return [
        asset
        for asset in candidates
        if asset.id not in chosen and _content_tag(asset, kinds) == tag
    ]


def _sample(pool: list[Asset], count: int) -> list[Asset]:
    picked = list(pool)
    random.shuffle(picked)
    return picked[:count]


def _tag_profile(
    packages: list[ContentPackage],
    by_id: dict[int, Asset],
    kinds: dict[str, str],
) -> tuple[dict[str, float], dict[str, list[int]]]:
    if not packages:
        return {}, {}
    totals: dict[str, int] = defaultdict(int)
    positions: dict[str, list[int]] = defaultdict(list)
    for package in packages:
        for index, asset_id in enumerate(package.secondary_asset_ids or []):
            asset = by_id.get(int(asset_id))
            if asset is None:
                continue
            tag = _content_tag(asset, kinds)
            totals[tag] += 1
            positions[tag].append(index)
    count = len(packages)
    return {tag: total / count for tag, total in totals.items() if total > 0}, positions


def _available_counts(candidates: list[Asset], kinds: dict[str, str]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for asset in candidates:
        counts[_content_tag(asset, kinds)] += 1
    return counts


def _scale_quotas(averages: dict[str, float], available: dict[str, int]) -> dict[str, int]:
    total = sum(averages.values())
    if total <= 0:
        return {}
    exact = {tag: weight / total * TARGET_COUNT for tag, weight in averages.items()}
    quotas = {tag: int(value) for tag, value in exact.items()}
    remainder = TARGET_COUNT - sum(quotas.values())
    by_fraction = sorted(exact, key=lambda tag: (exact[tag] - quotas[tag], averages[tag]), reverse=True)
    for tag in by_fraction:
        if remainder <= 0:
            break
        quotas[tag] += 1
        remainder -= 1

    overflow = 0
    for tag in list(quotas):
        cap = available.get(tag, 0)
        if quotas[tag] > cap:
            overflow += quotas[tag] - cap
            quotas[tag] = cap

    receivers = sorted(
        (tag for tag, stock in available.items() if stock > quotas.get(tag, 0)),
        key=lambda tag: (
            FILL_PRIORITY.index(tag) if tag in FILL_PRIORITY else len(FILL_PRIORITY),
            -(available[tag] - quotas.get(tag, 0)),
            tag,
        ),
    )
    for tag in receivers:
        if overflow <= 0:
            break
        room = available[tag] - quotas.get(tag, 0)
        take = min(room, overflow)
        quotas[tag] = quotas.get(tag, 0) + take
        overflow -= take
    return {tag: count for tag, count in quotas.items() if count > 0}


def _tag_order(quotas: dict[str, int], positions: dict[str, list[int]]) -> list[str]:
    def key(tag: str) -> tuple[float, int, str]:
        slots = positions.get(tag) or []
        average = sum(slots) / len(slots) if slots else 99.0
        team_first = 0 if tag == TEAM_TAG else 1
        return (average, team_first, tag)

    return sorted(quotas, key=key)


def _summary(chosen: list[int], picked_counts: dict[str, int], matched_benefit: bool) -> str:
    body = "、".join(
        f"{tag or '未打内容标签'} {count}" for tag, count in picked_counts.items() if count > 0
    )
    text = f"{len(chosen)} 张：{body}" if body else f"{len(chosen)} 张"
    if not matched_benefit:
        return f"未按利益点。{text}"
    return text
