// Event names in words: "quote_form_submitted" -> "Quote form sent". The raw name is still shown next to it, small.
const VERBS: Record<string, string> = {
  submitted: "sent",
  submit: "sent",
  opened: "opened",
  open: "opened",
  clicked: "clicked",
  click: "clicked",
};

// The automatic events have fixed names in plain words
const AUTO: Record<string, string> = {
  scroll_depth: "How far people scroll",
  section_viewed: "Sections seen",
  outbound_clicked: "Links to other sites",
  file_downloaded: "Downloads",
  time_on_page: "Time on page",
  pageview: "Page opened",
};

export function readableName(name: string): string {
  if (AUTO[name]) return AUTO[name];
  const words = name
    .split("_")
    .filter(Boolean)
    .map((w) => VERBS[w] ?? w);
  if (!words.length) return name;
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
