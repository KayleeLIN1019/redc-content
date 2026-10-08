from app.services.link_fetch import fetch_page_text, parse_xiaohongshu_html, strip_html
import json

import httpx
import pytest
from fastapi import HTTPException

XHS_HTML = """
<html>
<head>
  <meta property="og:title" content="小红书">
  <meta property="og:description" content="登录后查看更多">
</head>
<body>
<script>
window.__INITIAL_STATE__ = {
  "note": {
    "noteDetailMap": {
      "6a3e6f09000000001503fb35": {
        "note": {
          "title": "装企承诺怎么写",
          "desc": "工期不延期，这是我们的承诺。"
        }
      }
    }
  }
};
</script>
</body>
</html>
"""


def test_parse_xiaohongshu_initial_state() -> None:
    text = parse_xiaohongshu_html(XHS_HTML)
    assert "装企承诺怎么写" in text
    assert "工期不延期" in text


def test_parse_xiaohongshu_json_parse_assignment() -> None:
    payload = json.dumps(
        {"note": {"noteDetailMap": {"abc": {"note": {"title": "标题", "desc": "正文内容"}}}}},
        ensure_ascii=False,
    )
    escaped = json.dumps(payload)[1:-1]
    html = f'<script>window.__INITIAL_STATE__=JSON.parse("{escaped}")</script>'
    text = parse_xiaohongshu_html(html)
    assert "标题" in text
    assert "正文内容" in text


def test_parse_xiaohongshu_walks_nested_note_map() -> None:
    html = """
    <script>window.__INITIAL_STATE__ = {"feed":{"extra":{"note":{"noteDetailMap":{"id":{"note":{"title":"嵌套标题","desc":"嵌套正文"}}}}}}};</script>
    """
    text = parse_xiaohongshu_html(html)
    assert "嵌套标题" in text
    assert "嵌套正文" in text


def test_parse_xiaohongshu_falls_back_to_og() -> None:
    html = """
    <html><head>
      <meta property="og:title" content="客厅收纳清单">
      <meta property="og:description" content="柜门一开就能拿。">
    </head><body>小红书</body></html>
    """
    assert parse_xiaohongshu_html(html) == "客厅收纳清单\n\n柜门一开就能拿。"


def test_strip_html_keeps_plain_article() -> None:
    assert strip_html("<html><body><p>竞品 HTML 正文</p></body></html>") == "竞品 HTML 正文"


def test_fetch_xiaohongshu_shell_is_not_treated_as_body(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_get(url: str, **kwargs):
        return httpx.Response(
            200,
            text="<html><head><title>小红书 - 你的生活兴趣社区</title></head><body>小红书 - 你的生活兴趣社区</body></html>",
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(httpx, "get", fake_get)
    with pytest.raises(HTTPException) as exc:
        fetch_page_text("https://www.xiaohongshu.com/explore/abc")
    assert exc.value.status_code == 400
    assert "xsec_token" in exc.value.detail
