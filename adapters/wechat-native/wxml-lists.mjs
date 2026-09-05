import sax from 'sax';

// Preserve source formatting and normalize only actual wx:for attributes.
export function normalizeWxmlLists(source) {
  const parser = sax.parser(false, { lowercase: true });
  const replacements = [];
  parser.onopentag = () => {
    const start = parser.startTagPosition - 1;
    const end = parser.position;
    const tag = source.slice(start, end);
    const normalized = tag.replace(/\bwx:for\s*=\s*(["'])([\s\S]*?)\1/g, (attribute, quote, raw) => {
      const match = raw.trim().match(/^\{\{([\s\S]*)\}\}$/);
      if (!match) return attribute;
      const expression = match[1].trim();
      return `wx:for=${quote}{{(${expression}) == null ? [] : (${expression})}}${quote}`;
    });
    if (normalized !== tag) replacements.push({ start, end, normalized });
  };
  parser.write(source).close();
  let result = source;
  for (const { start, end, normalized } of replacements.reverse()) {
    result = result.slice(0, start) + normalized + result.slice(end);
  }
  return result;
}
