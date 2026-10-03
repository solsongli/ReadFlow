# 样式入口

| 页面 | 源码 | 产物 |
|---|---|---|
| 工作台 | `entries/workbench.css`、`themes/workbench.css` | `dist/css/workbench.css` |
| 阅读器 | `entries/reader.css` → `frontend/packages/reader/styles/entry.css` | `dist/css/reader.css` |

工作台使用独立语义令牌和显式 Tailwind source。阅读器保留包内皮肤与 PDF 白底；嵌入时跟随工作台明暗和界面字体。
字面颜色仅放 themes 目录。页面组件使用令牌；不再存在额外的页面 CSS 入口。
