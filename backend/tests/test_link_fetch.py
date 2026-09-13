from app.services.link_fetch import parse_xiaohongshu_html, strip_html

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
