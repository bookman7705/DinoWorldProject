/**
 * Open-source libraries used by the live app.
 *
 * Used by opensource.html. MIT and Apache 2.0 require preservation of
 * copyright and license notices in distributed copies — `requiresAttribution`
 * flags that obligation; `notice` stores the upstream copyright line.
 */
export const OPEN_SOURCE_SOFTWARE = [
  {
    name: "Three.js",
    version: "0.160",
    license: "MIT",
    licenseUrl: "https://github.com/mrdoob/three.js/blob/dev/LICENSE",
    projectUrl: "https://threejs.org/",
    requiresAttribution: true,
    notice: "Copyright (c) The three.js authors"
  },
  {
    name: "MindAR",
    version: "1.2.5",
    license: "MIT",
    licenseUrl: "https://github.com/hiukim/mind-ar-js/blob/master/LICENSE",
    projectUrl: "https://github.com/hiukim/mind-ar-js",
    requiresAttribution: true,
    notice: "Copyright (c) Miu Lab"
  },
  {
    name: "model-viewer",
    version: "unversioned (CDN)",
    license: "Apache License 2.0",
    licenseUrl: "https://www.apache.org/licenses/LICENSE-2.0",
    projectUrl: "https://modelviewer.dev/",
    requiresAttribution: true,
    notice: "Copyright 2018 Google LLC"
  }
];