import type { ApifyConfig, FirecrawlConfig } from "@/lib/types";

export const FIRECRAWL_MODES: { value: FirecrawlConfig["mode"]; label: string; desc: string }[] = [
  { value: "search", label: "Search the web", desc: "Search a query (e.g. “boutique law firms in Denver”), visit each company site and extract contacts." },
  { value: "crawl", label: "Crawl websites", desc: "Map each site, prioritise contact / about / team pages, and extract every person and email." },
  { value: "scrape", label: "Scrape exact URLs", desc: "Extract leads from a fixed list of pages (directories, member lists, landing pages)." },
];

export const APIFY_PRESETS: { id: string; name: string; desc: string; config: ApifyConfig }[] = [
  {
    id: "gmaps",
    name: "Google Maps businesses",
    desc: "Local businesses with phone, website and (optionally) emails from their sites.",
    config: {
      actor_id: "compass/crawler-google-places",
      max_items: 100,
      input: {
        searchStringsArray: ["dentist"],
        locationQuery: "Austin, Texas, USA",
        maxCrawledPlacesPerSearch: 100,
        language: "en",
        scrapeContacts: true,
        skipClosedPlaces: true,
      },
    },
  },
  {
    id: "contacts",
    name: "Contact details from websites",
    desc: "Crawl a list of company websites and collect emails, phones and social profiles.",
    config: {
      actor_id: "vdrmota/contact-info-scraper",
      max_items: 200,
      input: {
        startUrls: [{ url: "https://example.com" }],
        maxRequestsPerStartUrl: 15,
        maxDepth: 2,
        sameDomain: true,
        considerChildFrames: false,
      },
    },
  },
  {
    id: "custom",
    name: "Custom Actor",
    desc: "Any Actor from the Apify Store. Map its output fields if they aren't detected automatically.",
    config: { actor_id: "", max_items: 100, input: {} },
  },
];
