import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (!window.location.hash) {
  window.location.hash = "#/";
}

// Dark-first command-center: opt into dark mode immediately so the first paint
// matches the design. The Settings page exposes a toggle to switch.
document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(<App />);
