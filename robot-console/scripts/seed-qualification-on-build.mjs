if (process.env.SEED_QUALIFICATION_REPORT_ON_BUILD !== "1") {
  console.log("Provincial report database import skipped");
} else {
  console.log("Running requested provincial report database import");
  await import("./seed-qualification-report.mjs");
}
