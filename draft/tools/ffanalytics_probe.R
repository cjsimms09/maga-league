# TERRITORY: A
# ffanalytics MULTI-SOURCE PROJECTION PROBE — does the pipe work, and for whom?
#
# Cory, 2026-08-19: "can we not scrape fantasy projections from draft shark
# using this?" Two answers, both measured before this file was written:
#
#   1. ffanalytics does NOT scrape Draft Sharks. Zero matches for "draft shark"
#      anywhere in its source. It scrapes FantasySharks — a DIFFERENT company
#      with a confusingly similar name. Recorded here so the next reader does
#      not go looking for a source that was never there.
#   2. It DOES scrape twelve others, and the board it would feed is currently
#      one vendor: proj_mean == proj_sleeper exactly, 609 of 609.
#
# ── RULE 3e, WHICH IS THE WHOLE DESIGN OF THIS FILE ────────────────────────
# A scraper that returns nothing and a scraper that was asked wrong are
# indistinguishable from the outside, and only one of them is a finding. So
# every source is asked SEPARATELY inside its own tryCatch, its row count and
# error are recorded, and THE SCRIPT EXITS NON-ZERO IF THE TOTAL IS ZERO. A
# clean "no sources available" is not a result this probe is allowed to report
# quietly — it is a failed run until one source has demonstrably returned
# players.
#
# ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────
# It does not average, blend, score, or touch proj_mean. It writes RAW ROWS and
# a census. Whether a second source should reach the number Cory drafts on is a
# GRADED decision — and it cannot even be graded yet, because per-player
# projection history for these sources does not exist in this repo
# (proj_mean_blend.py's constructibility gate returns no_control). Getting the
# rows is step one of a longer road, and calling it anything more would be the
# same overreach this project keeps writing rules about.
#
# Run (Actions only — every host here is refused at CONNECT in the sandbox):
#   Rscript draft/tools/ffanalytics_probe.R

suppressPackageStartupMessages({
  library(ffanalytics)
  library(jsonlite)
})

ALL_SOURCES <- c("CBS", "ESPN", "FantasyPros", "FantasySharks", "FFToday",
                 "FleaFlicker", "NumberFire", "FantasyFootballNerd", "NFL",
                 "RTSports", "Walterfootball", "FantasyData")
POS <- c("QB", "RB", "WR", "TE", "K", "DST")

env_sources <- Sys.getenv("FFA_SOURCES", "")
sources <- if (nzchar(env_sources)) trimws(strsplit(env_sources, ",")[[1]]) else ALL_SOURCES
season <- as.integer(Sys.getenv("FFA_SEASON", "2026"))

cat("ffanalytics probe — season", season, "\n")
cat("sources asked:", paste(sources, collapse = ", "), "\n")
cat("positions:", paste(POS, collapse = ", "), "\n\n")

report <- list()
frames <- list()

for (src in sources) {
  # week = 0 is ffanalytics' season-total (preseason) scrape.
  res <- tryCatch({
    d <- scrape_data(src = src, pos = POS, season = season, week = 0)
    d
  }, error = function(e) e)

  if (inherits(res, "error")) {
    report[[src]] <- list(ok = FALSE, rows = 0, positions = list(),
                          error = substr(conditionMessage(res), 1, 300))
    cat(sprintf("  %-22s FAILED  %s\n", src, substr(conditionMessage(res), 1, 90)))
    next
  }

  # scrape_data returns a named list of per-position data frames.
  per_pos <- list(); total <- 0
  for (p in names(res)) {
    n <- tryCatch(nrow(res[[p]]), error = function(e) 0)
    if (is.null(n) || is.na(n)) n <- 0
    per_pos[[p]] <- n
    total <- total + n
    if (n > 0) {
      df <- res[[p]]
      keep <- intersect(c("id", "player", "team", "pos", "points", "data_src"), names(df))
      slim <- df[, keep, drop = FALSE]
      slim$source <- src
      slim$position <- p
      frames[[length(frames) + 1]] <- slim
    }
  }
  report[[src]] <- list(ok = TRUE, rows = total, positions = per_pos, error = NULL)
  cat(sprintf("  %-22s %6d rows   %s\n", src, total,
              paste(sprintf("%s=%s", names(per_pos), unlist(per_pos)), collapse = " ")))
}

grand <- sum(vapply(report, function(r) r$rows, numeric(1)))
ok_sources <- names(Filter(function(r) r$ok && r$rows > 0, report))

dir.create("draft/data", showWarnings = FALSE, recursive = TRUE)

out <- list(
  `_territory` = "TERRITORY: A — draft/tools/ffanalytics_probe.R",
  `_note` = paste("RAW ROWS ONLY. Nothing here is averaged, scored, or allowed",
                  "near proj_mean. ffanalytics does NOT scrape Draft Sharks —",
                  "it scrapes FantasySharks, a different company."),
  season = season,
  scraped_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
  sources_asked = sources,
  sources_returning_rows = ok_sources,
  total_rows = grand,
  per_source = report
)
write(toJSON(out, auto_unbox = TRUE, pretty = TRUE), "draft/data/ffanalytics_probe.json")

if (length(frames)) {
  all <- do.call(rbind, lapply(frames, function(f) {
    for (col in c("id", "player", "team", "pos", "points", "data_src", "source", "position")) {
      if (!col %in% names(f)) f[[col]] <- NA
    }
    f[, c("id", "player", "team", "pos", "position", "points", "source", "data_src")]
  }))
  write.csv(all, "draft/data/ffanalytics_raw_projections.csv", row.names = FALSE)
  cat("\nwrote draft/data/ffanalytics_raw_projections.csv —", nrow(all), "rows\n")
}

cat("\n  TOTAL", grand, "rows from", length(ok_sources), "of", length(sources), "sources\n")

# THE KNOWN-POSITIVE GATE. Zero rows is not a finding, it is a broken probe.
if (grand == 0) {
  cat("\nFAILING: every source returned zero rows. That is indistinguishable\n",
      "from asking wrong, so it is reported as a broken probe rather than as\n",
      "'the sources are unavailable'. Check the scraper selectors (ffanalytics\n",
      "was last patched 2026-07-15, 'transitioning css selector to xpath') and\n",
      "whether Actions egress reaches these hosts at all.\n")
  quit(status = 1)
}
