#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { load } from 'cheerio';

const args = process.argv.slice(2);

function parseArgs(argv) {
  const options = {
    input: 'urls.txt',
    output: 'data.json',
    headless: true,
    timeout: 120000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--input' || token === '-i') {
      options.input = argv[++i];
    } else if (token === '--output' || token === '-o') {
      options.output = argv[++i];
    } else if (token === '--timeout') {
      options.timeout = Number(argv[++i]) || options.timeout;
    } else if (token === '--headed') {
      options.headless = false;
    } else if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    } else if (!options.input || options.input === 'urls.txt') {
      options.input = token;
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node myntra-scraper.js --input urls.txt --output data.json

Options:
  --input, -i      Path to a text file containing one Myntra URL per line
  --output, -o     Output JSON file path
  --timeout        Page load timeout in ms (default: 120000)
  --headed        Open browser visibly instead of headless
  --help, -h       Show this help`);
}

function toText(value) {
  if (!value) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function simplifyProductName(value) {
  const name = toText(value);
  if (!name) return name;

  const normalized = name.toLowerCase();
  if (normalized.includes('midi dress')) return 'Midi Dress';
  if (normalized.includes('open toe block heel')) return 'Toe Block Heel';
  if (normalized.includes('puff sleeve fit & flare dress')) return 'Puff Dress';
  if (normalized.includes('square studs earrings')) return 'Stud Earrings';
  if (normalized.includes('drop earrings')) return 'Drop Earrings';
  if (normalized.includes('studded bracelets')) return 'Bracelets';
  if (normalized.includes('charm bracelet')) return 'Gold Bracelet';
  if (normalized.includes('stiletto sandals')) return 'Stiletto Sandals';

  return name;
}

function pickFirst(...values) {
  for (const value of values) {
    const text = toText(value);
    if (text) return text;
  }
  return '';
}

function walkJsonLd(value) {
  if (!value || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = walkJsonLd(item);
      if (match) return match;
    }
    return null;
  }

  if (value['@type'] === 'Product' || value.name || value.brand || value.offers) {
    return value;
  }

  for (const child of Object.values(value)) {
    const match = walkJsonLd(child);
    if (match) return match;
  }

  return null;
}

function normalizePrice(value) {
  if (!value) return '';
  if (typeof value === 'number') return `₹${value}`;
  const text = toText(value);
  return text || '';
}

function extractFromHtml(html, url) {
  const $ = load(html);

  let productFromJsonLd = null;
  $('script[type="application/ld+json"]').each((_, element) => {
    const text = $(element).html() || '';
    if (!text) return;

    try {
      const parsed = JSON.parse(text);
      const match = walkJsonLd(parsed);
      if (match) {
        productFromJsonLd = match;
        return false;
      }
    } catch {
      // Ignore malformed JSON-LD.
    }
  });

  const name = pickFirst(
    $('meta[property="og:title"]').attr('content'),
    $('meta[name="twitter:title"]').attr('content'),
    $('h1').first().text(),
    productFromJsonLd?.name,
    $('title').first().text()
  );

  const priceValue = pickFirst(
    $('meta[property="product:price:amount"]').attr('content'),
    $('meta[itemprop="price"]').attr('content'),
    productFromJsonLd?.offers?.price,
    productFromJsonLd?.offers?.lowPrice,
    productFromJsonLd?.offers?.highPrice,
    $('span').filter((_, el) => /\bprice\b|\bmrp\b|\bdiscountedPrice\b/i.test($(el).attr('class') || '')).first().text(),
    $('div').filter((_, el) => /\bprice\b|\bmrp\b|\bdiscountedPrice\b/i.test($(el).attr('class') || '')).first().text()
  );

  const imageValue = pickFirst(
    $('meta[property="og:image"]').attr('content'),
    $('meta[name="twitter:image"]').attr('content'),
    productFromJsonLd?.image,
    $('img').first().attr('src')
  );

  return {
    name: simplifyProductName(name),
    price: normalizePrice(priceValue),
    image: toText(imageValue),
    link: url
  };
}

async function scrapeProductPage(url) {
  const product = {
    name: '',
    price: '',
    image: '',
    link: url
  };

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      console.warn(`Could not load ${url}: ${response.status} ${response.statusText}`);
      return product;
    }

    const html = await response.text();
    const result = extractFromHtml(html, url);
    product.name = result.name || '';
    product.price = result.price || '';
    product.image = result.image || '';
    product.link = result.link || url;
  } catch (error) {
    console.warn(`Could not load ${url}: ${error.message}`);
  }

  return product;
}

async function main() {
  const options = parseArgs(args);

  let urls = [];
  try {
    const fileContent = await fs.readFile(options.input, 'utf8');
    urls = fileContent
      .replace(/\uFEFF/g, '')
      .replace(/\u0000/g, '')
      .split(/\r?\n/)
      .map((line) => line.replace(/[\u200B-\u200D\uFEFF]/g, '').trim())
      .filter((line) => line && !line.startsWith('#'))
      .filter((line) => /^https?:\/\//i.test(line));
  } catch (error) {
    console.error(`Could not read input file: ${options.input}`);
    console.error(error.message);
    process.exit(1);
  }

  if (!urls.length) {
    console.error('No product URLs found in the input file.');
    process.exit(1);
  }

  const products = [];

  for (const url of urls) {
    const entry = await scrapeProductPage(url);
    products.push({
      name: entry.name || '',
      price: entry.price || '',
      image: entry.image || '',
      link: entry.link || url
    });
  }

  const output = [{ modelImage: '', products }];
  const outputPath = path.resolve(process.cwd(), options.output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');

  console.log(`Saved ${products.length} product(s) to ${outputPath}`);
}

main().catch((error) => {
  console.error('Scraper failed:', error);
  process.exit(1);
});
