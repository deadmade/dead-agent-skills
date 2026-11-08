//! Finds a rendered page's repeating sibling groups and prints them as numbered rows.
#![cfg_attr(not(test), allow(dead_code))]

use std::collections::{BTreeMap, HashMap};
use std::fmt::Write as _;

use dom_query::{Document, Matcher, NodeId, NodeRef};
use url::Url;

/// A group needs this many like siblings, each with at least `MIN_TEXT` characters of text.
const MIN_ITEMS: usize = 6;
const MIN_TEXT: usize = 16;
/// An item's text counts toward the score only up to this many characters.
const SCORE_CAP: usize = 400;
const ROW_CHARS: usize = 200;
const GROUPS_RETURNED: usize = 2;
const NOT_SHOWN: &str = "script, style, template, noscript, [hidden], [aria-hidden=\"true\"]";

pub struct Row {
    pub text: String,
    pub link: Option<Url>,
}

pub struct Group {
    pub kind: String,
    pub total: usize,
    pub rows: Vec<Row>,
}

/// A group of like siblings before it is chosen: its parent, its items with their text, and its score.
struct Candidate<'a> {
    kind: String,
    parent: NodeRef<'a>,
    items: Vec<(NodeRef<'a>, String)>,
    score: usize,
    /// The score without the link share, to order groups when links give no difference.
    volume: usize,
}

/// The two largest repeating groups of `html`, largest first; with `item`, the matches of that selector alone.
pub fn find_groups(html: &str, base: &Url, item: Option<&str>) -> Result<Vec<Group>, String> {
    let item = item
        .map(|sel| Matcher::new(sel).map_err(|_| format!("invalid item selector {sel:?}")))
        .transpose()?;
    let doc = Document::from(html);
    doc.select(NOT_SHOWN).remove();
    let link =
        Matcher::new("a[href]:not([href=\"\"]):not([href^=\"#\"])").expect("static selector");
    if let Some(matcher) = item {
        let found = doc.select_matcher(&matcher);
        let nodes = found.nodes();
        return Ok(nodes
            .first()
            .map(|first| group(kind_of(first), nodes.iter(), &link, base))
            .into_iter()
            .collect());
    }
    let mut found = candidates(&doc, &link);
    drop_wrapped(&mut found);
    found.sort_by_key(|c| std::cmp::Reverse((c.score, c.volume)));
    Ok(found
        .iter()
        .take(GROUPS_RETURNED)
        .map(|c| group(c.kind.clone(), c.items.iter().map(|(n, _)| n), &link, base))
        .collect())
}

/// Prints `groups` (or only group `pick`, counted from 1) as numbered rows: at most `limit` per group. The
/// printed rows stay within `budget` characters, each whole; the group and `Showing` lines come on top.
pub fn render(groups: &[Group], pick: Option<usize>, limit: usize, budget: usize) -> String {
    let mut out = String::new();
    let mut used = 0;
    let shown = groups
        .iter()
        .enumerate()
        .filter(|(i, _)| pick.is_none_or(|p| p == i + 1));
    for (i, g) in shown {
        let head = format!("Group {}: {} items ({})\n", i + 1, g.total, g.kind);
        let mut body = String::new();
        let mut printed = 0;
        for (n, row) in g.rows.iter().take(limit).enumerate() {
            let mut line = format!("{}. {}", n + 1, row.text);
            if let Some(link) = &row.link {
                let _ = write!(line, " | {link}");
            }
            line.push('\n');
            if used + line.chars().count() > budget {
                break;
            }
            used += line.chars().count();
            body.push_str(&line);
            printed += 1;
        }
        if printed == 0 && !out.is_empty() {
            break;
        }
        out.push_str(&head);
        out.push_str(&body);
        let _ = writeln!(out, "Showing {printed} of {}.\n", g.total);
    }
    out.trim_end().to_owned()
}

fn group<'a>(
    kind: String,
    nodes: impl Iterator<Item = &'a NodeRef<'a>>,
    link: &Matcher,
    base: &Url,
) -> Group {
    let rows: Vec<Row> = nodes
        .map(|n| Row {
            text: text_of(n)
                .chars()
                .take(ROW_CHARS)
                .collect::<String>()
                .trim_end()
                .to_owned(),
            link: std::iter::once(*n)
                .chain(n.descendants_it())
                .filter(|a| a.is_match(link))
                .filter_map(|a| base.join(a.attr("href")?.trim()).ok())
                .find(|u| matches!(u.scheme(), "http" | "https")),
        })
        .collect();
    Group {
        kind,
        total: rows.len(),
        rows,
    }
}

/// Whether `node` is a link (an `a[href]` that is not empty or only a `#` anchor) or holds one.
fn has_link(node: &NodeRef, link: &Matcher) -> bool {
    std::iter::once(*node)
        .chain(node.descendants_it())
        .any(|n| n.is_match(link))
}

/// The element and its first two sorted classes, such as `DIV.card.galleryview__item`.
fn kind_of(node: &NodeRef) -> String {
    let tag = node.node_name().unwrap_or_default().to_uppercase();
    let class = node.class().unwrap_or_default();
    let mut classes: Vec<&str> = class.split_whitespace().collect();
    classes.sort_unstable();
    classes
        .iter()
        .take(2)
        .fold(tag, |kind, c| format!("{kind}.{c}"))
}

/// All text under `node`, whitespace-collapsed to one line.
fn text_of(node: &NodeRef) -> String {
    let mut text = String::new();
    for t in node.descendants_it().filter(NodeRef::is_text) {
        text.push_str(&t.text());
        text.push(' ');
    }
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Every set of at least `MIN_ITEMS` like children of one parent outside `nav`, `header` and `footer`.
fn candidates<'a>(doc: &'a Document, link: &Matcher) -> Vec<Candidate<'a>> {
    let skipped = Matcher::new("nav, header, footer").expect("static selector");
    let mut found = Vec::new();
    for parent in doc.select("*").nodes() {
        if std::iter::once(*parent)
            .chain(parent.ancestors_it(None))
            .any(|n| n.is_match(&skipped))
        {
            continue;
        }
        let mut by_kind: BTreeMap<String, Vec<(NodeRef, String)>> = BTreeMap::new();
        for child in parent.element_children() {
            let text = text_of(&child);
            if text.chars().count() >= MIN_TEXT {
                by_kind
                    .entry(kind_of(&child))
                    .or_default()
                    .push((child, text));
            }
        }
        for (kind, items) in by_kind
            .into_iter()
            .filter(|(_, items)| items.len() >= MIN_ITEMS)
        {
            let chars: usize = items.iter().map(|(_, t)| t.chars().count()).sum();
            let linked = items.iter().filter(|(n, _)| has_link(n, link)).count();
            // count times the smaller of the average length and the cap
            let volume = chars.min(SCORE_CAP * items.len());
            // times the square of the share of items with a link
            let score = volume * linked * linked / (items.len() * items.len());
            found.push(Candidate {
                kind,
                parent: *parent,
                items,
                score,
                volume,
            });
        }
    }
    found
}

/// Drops each group that sits inside the items of a group with an equal or higher score.
fn drop_wrapped(found: &mut Vec<Candidate>) {
    let mut best: HashMap<NodeId, usize> = HashMap::new();
    for c in found.iter() {
        for (item, _) in &c.items {
            let score = best.entry(item.id).or_default();
            *score = (*score).max(c.score);
        }
    }
    found.retain(|c| {
        !std::iter::once(c.parent)
            .chain(c.parent.ancestors_it(None))
            .any(|n| best.get(&n.id).is_some_and(|&s| s >= c.score))
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const ADS: &str = include_str!("../tests/fixtures/rows/ads_page.html");
    const CARDS: &str = include_str!("../tests/fixtures/rows/product_cards_page.html");
    const TILES: &str = include_str!("../tests/fixtures/rows/tiles_page.html");

    fn base() -> Url {
        Url::parse("https://shop.example/list/").unwrap()
    }

    fn groups(html: &str) -> Vec<Group> {
        find_groups(html, &base(), None).unwrap()
    }

    fn count(html: &str, selector: &str) -> usize {
        Document::from(html).select(selector).length()
    }

    /// `n` list items of distinct, long enough text.
    fn items(tag: &str, class: &str, n: usize) -> String {
        many(n, |i| {
            format!("<{tag} class=\"{class}\">item number {i} with enough text</{tag}>")
        })
    }

    fn many(n: usize, item: impl Fn(usize) -> String) -> String {
        (0..n).fold(String::new(), |mut all, i| {
            all.push_str(&item(i));
            all
        })
    }

    #[test]
    fn ads_page_first_group_is_the_ads() {
        let found = groups(ADS);
        assert_eq!(
            found[0].total,
            count(ADS, "ul#srchrslt-adtable > li[data-clickable=card]")
        );
        assert_ne!(found[0].rows[0].text, "");
    }

    #[test]
    fn product_cards_page_first_group_is_the_products() {
        let found = groups(CARDS);
        assert_eq!(found[0].total, count(CARDS, "div.card.galleryview__item"));
    }

    #[test]
    fn product_cards_page_item_selector_reads_the_filters() {
        let found = find_groups(CARDS, &base(), Some("div.filter-element")).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].total, count(CARDS, "div.filter-element"));
    }

    #[test]
    fn tiles_page_first_group_is_the_tiles() {
        let found = groups(TILES);
        assert_eq!(found[0].total, count(TILES, "h3 + div > article"));
        assert_ne!(found[0].rows[0].text, "");
    }

    #[test]
    fn nav_and_footer_are_skipped() {
        let html = format!(
            "<nav>{}</nav><main><ul>{}</ul></main>",
            items("a", "l", 10).replace("<a ", "<a href=\"/x\" "),
            items("li", "", 6)
        );
        let found = groups(&html);
        assert_eq!(found.len(), 1);
        assert!(found[0].kind.starts_with("LI"));
    }

    /// `n` `li`s, each a link with text of the given length plus `inner` HTML after it.
    fn linked(n: usize, text_len: usize, inner: &str) -> String {
        many(n, |i| {
            format!(
                "<li><a href=\"/p/{i}\">{}</a>{inner}</li>",
                "w".repeat(text_len)
            )
        })
    }

    #[test]
    fn nested_group_is_dropped() {
        let inner = format!("<ul>{}</ul>", linked(6, 20, ""));
        let found = groups(&format!("<ul>{}</ul>", linked(6, 20, &inner)));
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].total, 6);
    }

    #[test]
    fn inner_group_with_a_lower_score_is_dropped() {
        // each outer item holds its own long text and a shorter inner list, so its group scores higher
        let inner = format!("<ul>{}</ul>", linked(6, 20, ""));
        let found = groups(&format!("<ul>{}</ul>", linked(6, 60, &inner)));
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].total, 6);
    }

    #[test]
    fn a_hash_link_is_not_the_row_link() {
        let item = "<li><a href=\"#\">fav</a><a href=\"\">none</a><a href=\"/p/1\">Title of the product</a></li>";
        let found = groups(&format!("<ul>{}</ul>", item.repeat(6)));
        assert_eq!(
            found[0].rows[0].link.as_ref().unwrap().as_str(),
            "https://shop.example/p/1"
        );
    }

    #[test]
    fn without_links_the_larger_group_comes_first() {
        let cards = many(200, |i| {
            format!("<div class=\"card\" onclick=\"go()\">card number {i} with long text</div>")
        });
        let found = groups(&format!(
            "<ul>{}</ul><section>{cards}</section>",
            items("li", "", 6)
        ));
        assert_eq!(found[0].total, 200);
    }

    #[test]
    fn link_share_is_squared() {
        // scores: half-linked 600 * 1/4 = 150, fully linked 240; a plain share would give 300 and the other order
        let half = many(6, |i| {
            let text = "x".repeat(100);
            if i < 3 {
                format!("<p><a href=\"/a\">{text}</a></p>")
            } else {
                format!("<p>{text}</p>")
            }
        });
        let full = many(6, |i| {
            format!("<li><a href=\"/b/{i}\">{}</a></li>", "y".repeat(40))
        });
        let found = groups(&format!("<div>{half}</div><ul>{full}</ul>"));
        assert_eq!(found[0].kind, "LI");
    }

    #[test]
    fn hidden_and_script_text_is_not_counted() {
        let long = "x".repeat(40);
        let html = format!(
            "<ul>{}{}{}</ul>",
            format!("<li>a<script>{long}</script></li>").repeat(2),
            format!("<li>b<template>{long}</template></li>").repeat(2),
            format!("<li>c<span aria-hidden=\"true\">{long}</span></li>").repeat(2),
        );
        assert!(groups(&html).is_empty());
    }

    #[test]
    fn fewer_than_six_is_no_group() {
        assert!(groups(&format!("<ul>{}</ul>", items("li", "", 5))).is_empty());
    }

    #[test]
    fn item_selector_overrides() {
        let html = format!(
            "<ul>{}{}</ul>",
            items("li", "pick", 3),
            items("li", "other", 8)
        );
        let found = find_groups(&html, &base(), Some("li.pick")).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].total, 3);
    }

    #[test]
    fn invalid_item_selector_is_an_error() {
        assert!(find_groups("<ul></ul>", &base(), Some("li[")).is_err());
    }

    #[test]
    fn row_text_is_one_line_and_cut() {
        let long = "word\n".repeat(80);
        let html = format!("<ul>{}</ul>", format!("<li>{long}</li>").repeat(6));
        let text = &groups(&html)[0].rows[0].text;
        assert!(!text.contains('\n'));
        assert!(text.chars().count() <= 200);
    }

    #[test]
    fn link_is_absolute_against_the_base() {
        let linked = "<li><a href=\"item/1\">item with a link and text</a></li>".repeat(5);
        let html = format!("<ul>{linked}<li>item without any link at all</li></ul>");
        let rows = &groups(&html)[0].rows;
        assert_eq!(
            rows[0].link.as_ref().unwrap().as_str(),
            "https://shop.example/list/item/1"
        );
        assert!(rows[5].link.is_none());
    }

    fn rows(n: usize, len: usize) -> Group {
        Group {
            kind: "LI".into(),
            total: n,
            rows: (0..n)
                .map(|i| Row {
                    text: format!("row{i} ").repeat(len / 5).trim().into(),
                    link: None,
                })
                .collect(),
        }
    }

    #[test]
    fn render_limit_and_pick() {
        let all = [rows(10, 20), rows(7, 20)];
        let both = render(&all, None, 3, 10_000);
        assert_eq!(
            both.lines()
                .filter(|l| l.starts_with("1. ") || l.starts_with("3. "))
                .count(),
            4
        );
        assert!(both.contains("Showing 3 of 10."));
        let second = render(&all, Some(2), 3, 10_000);
        assert!(second.starts_with("Group 2: 7 items"));
        assert!(!second.contains("Group 1"));
    }

    #[test]
    fn render_budget_stops_on_a_whole_row() {
        let group = rows(50, 150);
        let out = render(std::slice::from_ref(&group), None, 200, 1000);
        let printed = out.lines().filter(|l| l.contains(". row")).count();
        assert!(printed > 0 && printed < 50);
        for (i, line) in out.lines().filter(|l| l.contains(". row")).enumerate() {
            assert_eq!(line, format!("{}. {}", i + 1, group.rows[i].text));
        }
        assert!(out.contains(&format!("Showing {printed} of 50.")));
    }

    #[test]
    fn render_prints_the_link_after_the_text() {
        let group = Group {
            kind: "LI".into(),
            total: 1,
            rows: vec![Row {
                text: "Title".into(),
                link: Some(Url::parse("https://shop.example/p/1").unwrap()),
            }],
        };
        let out = render(&[group], None, 5, 1000);
        assert!(out.contains("1. Title | https://shop.example/p/1\n"));
    }

    #[test]
    fn render_skips_a_group_the_budget_has_no_room_for() {
        let first = rows(2, 150);
        let out = render(&[first, rows(2, 150)], None, 5, 400);
        assert!(!out.contains("Group 2"));
    }
}
