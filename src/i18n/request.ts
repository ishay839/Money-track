import { getRequestConfig } from "next-intl/server";
import he from "./messages/he.json";

export default getRequestConfig(async () => {
  return {
    locale: "he",
    messages: he,
    timeZone: "Asia/Jerusalem",
  };
});
