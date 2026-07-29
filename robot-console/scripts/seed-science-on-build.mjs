if (process.env.SEED_SCIENCE_ON_BUILD !== "1") {
  console.log("Science database import skipped");
} else {
  console.log("Running requested science database import");
  await import("./seed-science-knowledge.mjs");
}
