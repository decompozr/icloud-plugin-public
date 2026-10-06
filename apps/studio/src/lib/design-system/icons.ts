/** Pinned Lucide geometry. Semantic names are owned by DecompozR; see lucide-provenance.json. */
export type IconNode = { readonly tag: 'path' | 'circle' | 'rect' | 'line' | 'polyline' | 'polygon' | 'ellipse'; readonly attributes: Readonly<Record<string, string>> };
export const icons = {
  "maximize": [{"tag": "path", "attributes": {"d": "M8 3H5a2 2 0 0 0-2 2v3"}}, {"tag": "path", "attributes": {"d": "M21 8V5a2 2 0 0 0-2-2h-3"}}, {"tag": "path", "attributes": {"d": "M3 16v3a2 2 0 0 0 2 2h3"}}, {"tag": "path", "attributes": {"d": "M16 21h3a2 2 0 0 0 2-2v-3"}}],
  "minimize": [{"tag": "path", "attributes": {"d": "M8 3v3a2 2 0 0 1-2 2H3"}}, {"tag": "path", "attributes": {"d": "M21 8h-3a2 2 0 0 1-2-2V3"}}, {"tag": "path", "attributes": {"d": "M3 16h3a2 2 0 0 1 2 2v3"}}, {"tag": "path", "attributes": {"d": "M16 21v-3a2 2 0 0 1 2-2h3"}}],

  "file-code": [
    {
      "tag": "path",
      "attributes": {
        "d": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M14 2v5a1 1 0 0 0 1 1h5"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M10 12.5 8 15l2 2.5"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "m14 12.5 2 2.5-2 2.5"
      }
    }
  ],
  "git-branch": [
    {
      "tag": "path",
      "attributes": {
        "d": "M15 6a9 9 0 0 0-9 9V3"
      }
    },
    {
      "tag": "circle",
      "attributes": {
        "cx": "18",
        "cy": "6",
        "r": "3"
      }
    },
    {
      "tag": "circle",
      "attributes": {
        "cx": "6",
        "cy": "18",
        "r": "3"
      }
    }
  ],
  "folder": [
    {
      "tag": "path",
      "attributes": {
        "d": "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
      }
    }
  ],
  "file": [
    {
      "tag": "path",
      "attributes": {
        "d": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M14 2v5a1 1 0 0 0 1 1h5"
      }
    }
  ],
  "panels-top-left": [
    {
      "tag": "rect",
      "attributes": {
        "width": "18",
        "height": "18",
        "x": "3",
        "y": "3",
        "rx": "2"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M3 9h18"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M9 21V9"
      }
    }
  ],
  "plus": [
    {
      "tag": "path",
      "attributes": {
        "d": "M5 12h14"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M12 5v14"
      }
    }
  ],
  "minus": [
    {
      "tag": "path",
      "attributes": {
        "d": "M5 12h14"
      }
    }
  ],
  "close": [
    {
      "tag": "path",
      "attributes": {
        "d": "M18 6 6 18"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "m6 6 12 12"
      }
    }
  ],
  "search": [
    {
      "tag": "path",
      "attributes": {
        "d": "m21 21-4.34-4.34"
      }
    },
    {
      "tag": "circle",
      "attributes": {
        "cx": "11",
        "cy": "11",
        "r": "8"
      }
    }
  ],
  "chevron-down": [
    {
      "tag": "path",
      "attributes": {
        "d": "m6 9 6 6 6-6"
      }
    }
  ],
  "arrow-right": [
    {
      "tag": "path",
      "attributes": {
        "d": "M5 12h14"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "m12 5 7 7-7 7"
      }
    }
  ],
  "check": [
    {
      "tag": "path",
      "attributes": {
        "d": "M20 6 9 17l-5-5"
      }
    }
  ],
  "info": [
    {
      "tag": "circle",
      "attributes": {
        "cx": "12",
        "cy": "12",
        "r": "10"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M12 16v-4"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M12 8h.01"
      }
    }
  ],
  "warning": [
    {
      "tag": "path",
      "attributes": {
        "d": "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M12 9v4"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M12 17h.01"
      }
    }
  ],
  "error": [
    {
      "tag": "path",
      "attributes": {
        "d": "m15 9-6 6"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "m9 9 6 6"
      }
    }
  ],
  "files": [
    {
      "tag": "path",
      "attributes": {
        "d": "M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1"
      }
    }
  ],
  "settings": [
    {
      "tag": "path",
      "attributes": {
        "d": "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
      }
    },
    {
      "tag": "circle",
      "attributes": {
        "cx": "12",
        "cy": "12",
        "r": "3"
      }
    }
  ],
  "panel-left": [
    {
      "tag": "rect",
      "attributes": {
        "width": "18",
        "height": "18",
        "x": "3",
        "y": "3",
        "rx": "2"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M9 3v18"
      }
    }
  ],
  "play": [
    {
      "tag": "path",
      "attributes": {
        "d": "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"
      }
    }
  ],
  "radio": [
    {
      "tag": "path",
      "attributes": {
        "d": "M16.247 7.761a6 6 0 0 1 0 8.478"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M19.075 4.933a10 10 0 0 1 0 14.134"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M4.925 19.067a10 10 0 0 1 0-14.134"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M7.753 16.239a6 6 0 0 1 0-8.478"
      }
    },
    {
      "tag": "circle",
      "attributes": {
        "cx": "12",
        "cy": "12",
        "r": "2"
      }
    }
  ],
  "message-square": [
    {
      "tag": "path",
      "attributes": {
        "d": "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"
      }
    }
  ],
  "mouse-pointer-2": [
    {
      "tag": "path",
      "attributes": {
        "d": "M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"
      }
    }
  ],
  "camera": [
    {
      "tag": "path",
      "attributes": {
        "d": "M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"
      }
    },
    {
      "tag": "circle",
      "attributes": {
        "cx": "12",
        "cy": "13",
        "r": "3"
      }
    }
  ],
  "arrow-up": [
    {
      "tag": "path",
      "attributes": {
        "d": "m5 12 7-7 7 7"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M12 19V5"
      }
    }
  ],
  "pencil": [
    {
      "tag": "path",
      "attributes": {
        "d": "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "m15 5 4 4"
      }
    }
  ],
  "trash-2": [
    {
      "tag": "path",
      "attributes": {
        "d": "M10 11v6"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M14 11v6"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M3 6h18"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
      }
    }
  ],
  "download": [
    {
      "tag": "path",
      "attributes": {
        "d": "M12 15V3"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "m7 10 5 5 5-5"
      }
    }
  ],
  "chevron-up": [
    {
      "tag": "path",
      "attributes": {
        "d": "m18 15-6-6-6 6"
      }
    }
  ],
  "circle-dot": [
    {
      "tag": "circle",
      "attributes": {
        "cx": "12",
        "cy": "12",
        "r": "1"
      }
    },
    {
      "tag": "circle",
      "attributes": {
        "cx": "12",
        "cy": "12",
        "r": "10"
      }
    }
  ],
  "unplug": [
    {
      "tag": "path",
      "attributes": {
        "d": "m19 5 3-3"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "m2 22 3-3"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M7.5 13.5 10 11"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M10.5 16.5 13 14"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"
      }
    }
  ],
  "refresh": [
    {
      "tag": "path",
      "attributes": {
        "d": "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M21 3v5h-5"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"
      }
    },
    {
      "tag": "path",
      "attributes": {
        "d": "M8 16H3v5"
      }
    }
  ]
} as const satisfies Record<string, readonly IconNode[]>;

export type IconName = keyof typeof icons;
/** Numbers retain CSS-pixel sizing; relative lengths follow root or local text. */
export type IconSize = 16 | 20 | 24 | 32 | `${number}rem` | `${number}em`;
