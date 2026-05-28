
/* ---------- UI Mockup pane (AI-generated HTML preview) ---------- */
function UiPreviewPane({ prompt }: { prompt: any }) {
  const [busy, setBusy] = useState(false);
  const [html, setHtml] = useState<string | null>(prompt?.ui_preview_html ?? null);
  const genFn = useServerFn(generateUiPreview);

  useEffect(() => {
    setHtml(prompt?.ui_preview_html ?? null);
  }, [prompt?.id, prompt?.ui_preview_html]);

  const generate = async () => {
    if (!prompt?.id) return toast.error("Pick or write a prompt first");
    setBusy(true);
    try {
      const r = await genFn({ data: { promptId: prompt.id } });
      setHtml(r.html);
      toast.success("UI mockup ready");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't generate the mockup");
    } finally {
      setBusy(false);
    }
  };

  const openInNewTab = () => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (!prompt) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Write or select a prompt to generate a UI mockup.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-[#1e1e1e]">
        <div className="text-xs text-muted-foreground truncate">
          AI-generated visual mockup for: <span className="text-foreground/90">{prompt.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={generate} disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-amber-500 text-background font-medium hover:opacity-90 disabled:opacity-50">
            <Sparkles className="h-3.5 w-3.5" />
            {busy ? "Generating..." : html ? "Regenerate" : "Generate UI mockup"}
          </button>
          {html && (
            <button onClick={openInNewTab}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-[#1e1e1e] text-foreground/90 hover:border-foreground">
              <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 bg-white">
        {html ? (
          <iframe srcDoc={html} title="UI mockup" className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms" />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground bg-[#0a0a0a]">
            {busy ? "Designing your mockup..." : "Click \"Generate UI mockup\" to visualize this prompt before building."}
          </div>
        )}
      </div>
    </div>
  );
}
