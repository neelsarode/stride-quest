// Auth provider config consumed by the Convex deployment.
// CONVEX_SITE_URL is set automatically on your deployment by Convex.
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
