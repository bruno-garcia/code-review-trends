/**
 * Renders a JSON-LD <script> tag for structured data.
 * Accepts any JSON-serializable object.
 *
 * Escapes `<` as `\u003c` to prevent `</script>` sequences in data
 * from breaking out of the script tag.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
