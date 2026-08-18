import "./styles.css";
import { mountCompanyOS } from "./mount.ts";

const mountElement = document.querySelector<HTMLElement>("#company-os-root");
if (!mountElement) throw new Error("Company OS root element was not found.");

mountCompanyOS({ mountElement });

