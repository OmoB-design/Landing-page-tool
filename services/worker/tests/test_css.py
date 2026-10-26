"""Scoping a page's CSS to one element (D90: a Shopify page inside the store's theme)."""

from app.engines.css import blocks, root_font_px, scope_css


def test_root_selectors_become_the_scope_and_the_rest_its_descendants() -> None:
    css = "html, body{margin:0} body > header .a{x:1} :root{--c:red} * {box-sizing:border-box}"
    assert scope_css(css, "#s") == (
        "#s{margin:0}\n#s > header .a{x:1}\n#s{--c:red}\n#s, #s *{box-sizing:border-box}"
    )


def test_selector_lists_split_only_on_top_level_commas() -> None:
    css = ':is(.a, .b) p, a[title="x,y"]{content:"{,}"}'
    assert scope_css(css, "#s") == '#s :is(.a, .b) p, #s a[title="x,y"]{content:"{,}"}'


def test_grouping_at_rules_are_scoped_inside_and_others_kept() -> None:
    css = (
        "@media (min-width:48rem){.h{font-size:3rem}}"
        "@keyframes f{from{opacity:0}to{opacity:1}}"
        "@font-face{font-family:X;src:url(x.woff2)}/* note */"
    )
    assert scope_css(css, "#s", 16) == (
        "@media (min-width:48rem){#s .h{font-size:48px}}\n"
        "@keyframes f{from{opacity:0}to{opacity:1}}\n"
        "@font-face{font-family:X;src:url(x.woff2)}"
    )


def test_rem_follows_the_pages_own_root_size() -> None:
    assert root_font_px(".a{x:1}") == 16
    assert root_font_px("html{font-size:62.5%}") == 10
    assert root_font_px(":root { color: red; font-size: 20px }") == 20
    assert scope_css(".a{padding:.5rem 1.25rem;margin:-1rem}", "#s", 10) == (
        "#s .a{padding:5px 12.5px;margin:-10px}"
    )


def test_blocks_skip_braces_inside_strings() -> None:
    assert blocks('.a{content:"}"} @import url(x.css); .b{c:d}') == [
        (".a", 'content:"}"'),
        ("@import url(x.css);", ""),
        (".b", "c:d"),
    ]
