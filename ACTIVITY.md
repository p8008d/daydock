# Dashboard activity

This measures whether people use the dashboard before replacing it. It cannot
recover historical usage. It records daily totals and counts per random browser
ID on your own server. The ID is stored in first-party localStorage, without
cookies or fingerprinting. It does not store IP addresses, user agents,
referrers, bookmark URLs, names, or dashboard contents. Hosting infrastructure
may maintain its own access logs.

## Deploy on Dokploy

For a **Docker Compose** deployment, the checked-in compose file enables tracking
and mounts a named volume at `/app/data/activity`.

For a Dokploy **Application** built with the Dockerfile:

1. Set the storage location (the enabled variable is optional in production):
   ```env
   NUXT_PUBLIC_ACTIVITY_ENABLED=true
   NUXT_ACTIVITY_DIR=/app/data/activity
   ```
2. Under Advanced → Volumes, mount a persistent volume at `/app/data/activity`.
   Ensure the container can write to it.
3. Use **one replica / one Node process**. The file counter serializes writes
   inside one process; multiple writers sharing the directory are unsupported.
4. Deploy. Preserve this volume during future deployments. The files are tiny
   daily aggregates and remain until you remove them.

Tracking is **enabled by default in production builds** and disabled in local
development. Set `NUXT_PUBLIC_ACTIVITY_ENABLED=false` to disable it explicitly.
No new package, analytics account, or database is required. Results have no
public API.

## Exclude yourself

On every browser you use, open your deployed Daydock URL with `?activity=off`. This stores an
exclusion preference locally, before the first event is sent. It persists across
reloads. `?activity=on` removes that preference. The footer also offers an opt-out.
Do Not Track and Global Privacy Control are respected. If localStorage is blocked,
tracking is skipped.

## Read the report

In the running application's Dokploy terminal:

```sh
node /app/scripts/activity-report.mjs 30
```

Or, for the checked-in Compose deployment, from the host:

```sh
docker exec daydock-dashboard node /app/scripts/activity-report.mjs 30
```

The optional number is the number of UTC calendar days, including today.
The default report uses narrow plain-text tables, eight-character browser IDs,
and the main activity counters. `Days` means active days; `C.Days` means days
seen with customizations; `C.Act` means interactions while customized. `Seen`
is the last observed date and `State` is the last observed dashboard state.
The repeat counts require at least two qualifying days in the selected period.
For full browser IDs and every counter, use:

```sh
node /app/scripts/activity-report.mjs 30 --wide
```

The report resolves its default storage path relative to the application, so
the command works even when Dokploy opens the terminal at `/`. An absolute
`NUXT_ACTIVITY_DIR` overrides that path; relative values are relative to the app.

| Column | Meaning |
| --- | --- |
| `open` | Dashboard initialized in a loaded page |
| `saved_open` | That page loaded valid data already saved in the browser |
| `customized_open` | Opens where the saved dashboard content differs from the bundled defaults |
| `customized_actions` | Interaction events while the dashboard differs from the defaults |
| `active` | A loaded page performed at least one tracked interaction that day |
| `active_saved` | An active page that loaded previously saved data |
| `bookmark_open` | Bookmark opens (left/keyboard or middle click) |
| `dashboard_edit` | Successful changed saves: create, edit, delete, reorder, wallpaper, import, or reset |
| `dashboard_switch` | Switches to another dashboard |
| `dashboard_export` | Export requests |

Action columns count events; one drag operation can cause multiple saved changes.
`active` counts once per loaded page per UTC day across all action types. A page
left open across midnight can record activity on the new day without another
`open`. Reloads and separate tabs can count again in `active`.

The report also shows **distinct browsers**, **active browsers**, browsers active
on multiple days, and a table of activity for each browser ID, with active days
and last active date within the selected period. These are estimates of user
counts: different browsers/devices or clearing storage create separate IDs;
people sharing a browser share an ID. `saved_open` and `active_saved` can include
unchanged defaults from an earlier visit, not just customized dashboards.

For deciding whether anyone has invested in this dashboard, focus on
**customized dashboards observed**, **customized on multiple days**, and
**interacted while customized**. The browser table puts repeat customized usage
first. `customized_days` counts days when a customized dashboard was observed;
`customized_active_days` counts days with interactions while customized.
`last_state` is `default` or `customized` at the last received event, so resetting
to the defaults is visible. It is not a live check of browsers that have stopped
visiting. `last_seen` and `last_active` help distinguish an old customization from
recent use. All day counts refer to the selected reporting window.

The comparison runs entirely in the browser and transmits only a boolean. It
checks names, links, descriptions, categories, their order, and wallpapers.
Changing the active tab or internal IDs does not count as customization.
Keep the bundled defaults stable during the observation period: changing them
can make an old unmodified dashboard appear customized. Someone with only the
default dashboard is excluded from the customized-user counts, even if they
click links. Their interactions remain visible in the general activity counts.

Automatic first-visit setup, storage repairs, unchanged saves, and failed saves
do not count as edits. The counter ignores plain HTTP visits, fallback landing
traffic with no dashboard interactions, and simple crawlers. Browser automation
and forged requests can still generate events; this is an activity signal, not
proof of human identity. Browser blocking, request failures, opt-outs, and tabs
that haven't reloaded since deployment can undercount. Events are best effort
with no retry. Right-click → open in new tab is not counted.

## Verify after deployment

Use a separate browser without the exclusion preference. Load the dashboard,
open a bookmark, and make one edit. Check that `active` increases by one and
the corresponding action columns appear. Reload to check `saved_open`. Then
open `?activity=off`, repeat, and confirm that the counts stop increasing.
Record the day of this check so your test activity isn't mistaken for users.

Check Dokploy logs for `[activity]` errors if counts aren't appearing. Confirm
that POST `/api/activity` returns 204 in browser developer tools. After a restart,
run the report again to confirm the volume retained the counts.

Observe a few weeks of normal use. Activity on several days, especially
`active_saved` plus bookmark opens or edits, supports keeping a route to the old
dashboard. Zero recorded activity lowers uncertainty but doesn't prove nobody
will return. Retaining the app on the same origin preserves access to existing browser data.
Moving to another domain requires exporting and importing dashboards.

## Local verification

Run `npm run build`, then `node --test tests/activity.test.mjs` with Node 24.
The tests use temporary data and local HTTP servers to check event validation,
browser exclusion, successful edits versus initialization, concurrent writes,
reporting, persistence after restart, and the production default.
