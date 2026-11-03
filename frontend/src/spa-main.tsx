import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { QrakulaApp } from "./qrakula/QrakulaApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QrakulaApp />
  </StrictMode>,
);
