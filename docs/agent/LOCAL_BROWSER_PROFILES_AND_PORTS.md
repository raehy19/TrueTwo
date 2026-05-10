# Local Browser Profiles And Ports

Use this file only if the project introduces browser automation, manual localhost QA, or multiple browser lanes.

## Current Status
- No dedicated localhost ports, browser profiles, or DevTools lanes are assigned yet.

## When To Update This File
- The project starts a web app or local admin surface.
- Browser automation requires stable profile separation.
- Multiple local services need fixed ports.
- A team needs named browser lanes for reproducible QA.

## Minimum Fields To Record
- Service name
- Localhost URL and fixed port
- Browser profile or lane name
- DevTools port if applicable
- Owner or intended use
- Special login or seed-data requirements

## Tool Preference
- Prefer `chrome-devtools` MCP first for browser inspection and manual validation.
- Use Playwright only when deterministic regression coverage or explicit Playwright work is required.
