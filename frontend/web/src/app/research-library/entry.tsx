import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("research-library-root");
if (!root) throw new Error("文献库挂载节点不存在。");
createRoot(root).render(<App />);
