// Registers the HTTP endpoints Convex Auth needs (token exchange, etc.).
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
