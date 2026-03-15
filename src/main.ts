import { createApp } from "vue";
import "./assets/index.css";
import App from "./App.vue";
import { initDb } from "./db";

initDb().finally(() => {
  createApp(App).mount("#app");
});
