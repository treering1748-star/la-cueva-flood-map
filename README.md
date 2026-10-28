# La Cueva Flood Study – interactive map

Interactive web map of the La Cueva erosion and runoff study area, Jemez Mountains, Sandoval County, New Mexico.

**Live map:** https://treering1748-star.github.io/la-cueva-flood-map/

## Layers
- 2024 Valles Caldera / Jemez Mountains bare-earth lidar (NV5 Geospatial, contracted by the U.S. Army Corps of Engineers, St. Louis District, and the National Park Service; acquired 22–28 Aug 2024): elevation + hillshade, 0.25 m hillshade, slope class
- D8 drainage lines (contributing area ≥ 0.2 ha), 20 ft and 40 ft contours
- Roads by ownership (NMDOT; names from NM911), Forest Service roads (USFS Region 3), NMDOT bridges
- 16 geotagged field photos from the 27 October 2026 walk, with camera direction and walk-group context

## Tools
Photo viewer with previous/next, walk-group filter, spot elevation and slope, elevation profile, distance and area measurement, live GPS location, and shareable links (the URL records the view, layers and open photo).

## Notes and limits
Photo points are camera GPS positions (error 2.7–13.8 m), not surveyed feature locations. Drainage contributing areas are counted only within the lidar rectangle, and culverts are not modelled. Not survey-grade; for planning and discussion only.

## Structure
`index.html`, `app.js`, `style.css` – the page (Leaflet 1.9.4 and proj4js 2.9.0 bundled in `lib/`)
`tiles/{terrain,hillshade,slope}/{z}/{x}/{y}` – raster tiles, zoom 12–18 (JPEG interior, PNG edge tiles listed in `data/edge_tiles.json`)
`data/` – GeoJSON layers and a 2 m elevation grid (`dem_2m.u16`, uint16 centimetres above 2200 m; see `dem_2m.json`)
`photos/web`, `photos/thumb` – resized photos named by photo ID

Compiled by Thomas W. Swetnam, Jemez Mountains Tree-Ring Lab, October 2026, with analysis and mapping assistance from Claude (Anthropic).
