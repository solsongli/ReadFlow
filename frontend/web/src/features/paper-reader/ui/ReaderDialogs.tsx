import { Button } from "@/ui/wb/Button.js";
import type { useReaderModel } from "../state/useReaderModel.js";
export function ReaderDialogs({ model }: { model: ReturnType<typeof useReaderModel> }) {
  const {
    external,
    setExternal,
    bookmark,
    setBookmark,
    reading,
    position,
    mode,
    setLeft,
    setNav,
    notice,
    setNotice,
  } = model;
  return (
    <>
      {external ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="打开外部链接"
          className="absolute inset-0 z-50 flex items-center justify-center bg-wb-overlay p-4"
        >
          <div className="max-w-md rounded-xl bg-wb-panel p-5 shadow-wb-pop">
            <h2 className="text-[1rem] font-semibold">用系统浏览器打开？</h2>
            <p className="break-all text-[0.8125rem] text-wb-text-3">{external}</p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setExternal(null)}>取消</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  try {
                    if (window.retainPdfDesktop?.invoke) {
                      await window.retainPdfDesktop.invoke("open_confirmed_external", { url: external });
                    } else {
                      window.open(external, "_blank", "noopener,noreferrer");
                    }
                    setExternal(null);
                  } catch {
                    setNotice("无法打开链接，请重试。");
                  }
                }}
              >
                打开链接
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {bookmark != null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="添加书签"
          className="absolute inset-0 z-50 flex items-center justify-center bg-wb-overlay p-4"
        >
          <form
            className="w-80 rounded-xl bg-wb-panel p-5 shadow-wb-pop"
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await reading.add(
                  position.page,
                  Math.max(0, Math.min(1, position.offset)),
                  bookmark,
                  mode === "translated" ? "translated" : "source",
                )
              ) {
                setBookmark(null);
                setLeft(true);
                setNav("bookmarks");
                setNotice("书签已保存");
              }
            }}
          >
            <h2 className="mt-0 text-[1rem] font-semibold">添加书签 · 第 {position.page} 页</h2>
            <input
              autoFocus
              aria-label="书签名称"
              required
              maxLength={200}
              value={bookmark}
              onChange={(event) => setBookmark(event.target.value)}
              className="w-full rounded-lg border-0 bg-wb-fill p-2"
            />
            {reading.error ? (
              <p role="status" className="text-[0.75rem] text-wb-text-3">
                {reading.error}
              </p>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <Button onClick={() => setBookmark(null)}>取消</Button>
              <Button type="submit" variant="primary">
                保存书签
              </Button>
            </div>
          </form>
        </div>
      ) : null}
      {(notice || reading.error) && bookmark == null && !external ? (
        <div
          role="status"
          className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-wb-panel px-4 py-2 text-[0.75rem] shadow-wb-pop"
        >
          <span>{notice || reading.error}</span>
          {reading.error ? (
            <Button size="sm" onClick={() => void reading.load()}>
              重试
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={() => {
              setNotice("");
              reading.clearError();
            }}
          >
            收起
          </Button>
        </div>
      ) : null}
    </>
  );
}
