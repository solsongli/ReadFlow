# 样式入口

| 页面 | 源码 | 产物 |
|---|---|---|
| 工作台（含原生阅读器、画布与闪卡） | `entries/workbench.css`、`themes/workbench.css` | `dist/css/workbench.css` |

工作台使用语义令牌和显式 Tailwind source。原生阅读器直接继承界面明暗与字体，PDF 页面底色由阅读偏好控制。
字面颜色仅放 themes 目录。组件使用令牌；没有独立阅读器页面或旧皮肤 CSS 入口。
