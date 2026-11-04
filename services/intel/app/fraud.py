"""Click fraud scoring. Scores are 0 (clean) to 1 (almost certainly invalid). Heuristics for now;
the inputs are shaped so a trained model can replace `score_batch` later."""

from collections import Counter


def score_batch(clicks: list[dict]) -> list[dict]:
    per_ip_link = Counter((c["ip_hash"], c["link_id"]) for c in clicks)
    per_ip = Counter(c["ip_hash"] for c in clicks)
    per_ua_link = Counter((c["ua_hash"], c["link_id"]) for c in clicks)
    links_per_publisher_ip: dict[tuple, set] = {}
    for c in clicks:
        links_per_publisher_ip.setdefault((c["publisher_id"], c["ip_hash"]), set()).add(c["link_id"])

    out = []
    for c in clicks:
        s = 0.0
        repeats = per_ip_link[(c["ip_hash"], c["link_id"])]
        if repeats > 3:
            s += min(0.5, 0.1 * repeats)  # same visitor hammering one link
        if per_ip[c["ip_hash"]] > 20:
            s += 0.3  # one address across many links: proxy or bot
        if per_ua_link[(c["ua_hash"], c["link_id"])] > 50:
            s += 0.2  # identical client fingerprint at volume
        if not c.get("country"):
            s += 0.1  # Cloudflare could not place it (Tor or unknown)
        if len(links_per_publisher_ip[(c["publisher_id"], c["ip_hash"])]) > 5:
            s += 0.2  # a publisher clicking through their own links
        out.append({"id": c["id"], "score": round(min(s, 1.0), 3)})
    return out
