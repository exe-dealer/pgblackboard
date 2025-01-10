import maplibregl from '../_vendor/maplibre.js';
import ne_cities from './ne_cities.js';
import ne_land from './ne_land.js';
import glyphs from './glyphs.js';

const { Map: MaplibreMap, LngLatBounds, MercatorCoordinate } = maplibregl;

const ne_land_blob = new Blob([JSON.stringify(ne_land)], { type: 'application/json' });
const ne_land_url = URL.createObjectURL(ne_land_blob);

const ne_cities_blob = new Blob([JSON.stringify(ne_cities)], { type: 'application/json' });
const ne_cities_url = URL.createObjectURL(ne_cities_blob);

const glyphs_blob = await fetch(glyphs).then(x => x.blob());
const glyphs_url = URL.createObjectURL(glyphs_blob);

// const drop_white = /*xml*/ `
//   <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
//     <path fill="#f0f0f0" stroke="#f0f0f0" fill-opacity="0.8" stroke-width="1.5" d="M4.11619 13.9087L4.11618 13.9087C3.71889 12.9491 3.5 11.9 3.5 10.8C3.5 6.22655 7.29492 2.5 12 2.5C16.7051 2.5 20.5 6.22654 20.5 10.8C20.5 11.9 20.2811 12.9491 19.8838 13.9087C19.5776 14.6484 18.9254 15.6255 18.0848 16.6992C17.2516 17.7634 16.2603 18.889 15.3054 19.9196C14.3514 20.9493 13.4382 21.8796 12.7632 22.5526C12.4511 22.8639 12.1901 23.1199 12 23.3049C11.8099 23.1199 11.5489 22.8639 11.2368 22.5526C10.5618 21.8796 9.64859 20.9493 8.69455 19.9196C7.73971 18.889 6.74839 17.7634 5.91519 16.6992C5.07457 15.6255 4.42238 14.6484 4.11619 13.9087ZM12 14.5C13.933 14.5 15.5 12.933 15.5 11C15.5 9.067 13.933 7.5 12 7.5C10.067 7.5 8.5 9.067 8.5 11C8.5 12.933 10.067 14.5 12 14.5Z" />
//   </svg>
// `;

// const drop_black = /*xml*/ `
//   <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
//     <path fill="#555" stroke="#555" fill-opacity="0.8" stroke-width="1.5" d="M4.11619 13.9087L4.11618 13.9087C3.71889 12.9491 3.5 11.9 3.5 10.8C3.5 6.22655 7.29492 2.5 12 2.5C16.7051 2.5 20.5 6.22654 20.5 10.8C20.5 11.9 20.2811 12.9491 19.8838 13.9087C19.5776 14.6484 18.9254 15.6255 18.0848 16.6992C17.2516 17.7634 16.2603 18.889 15.3054 19.9196C14.3514 20.9493 13.4382 21.8796 12.7632 22.5526C12.4511 22.8639 12.1901 23.1199 12 23.3049C11.8099 23.1199 11.5489 22.8639 11.2368 22.5526C10.5618 21.8796 9.64859 20.9493 8.69455 19.9196C7.73971 18.889 6.74839 17.7634 5.91519 16.6992C5.07457 15.6255 4.42238 14.6484 4.11619 13.9087ZM12 14.5C13.933 14.5 15.5 12.933 15.5 11C15.5 9.067 13.933 7.5 12 7.5C10.067 7.5 8.5 9.067 8.5 11C8.5 12.933 10.067 14.5 12 14.5Z" />
//   </svg>
// `;

const methods = {
  _render() {
    return { tag: 'div', class: 'map' };
  },
  _mounted() {
    this._ml = new MaplibreMap({
      container: this.$el,
      attributionControl: false, // TODO ?
      maxPitch: 0,
    });
    this._ml.on('click', this.on_map_click);

    this.$watch(
      this.get_ml_style,
      val => this._ml.setStyle(val),
      { immediate: true },
    );

    // this.add_svg_image('drop_white', drop_white);
    // this.add_svg_image('drop_black', drop_black);
    // this.add_svg_image('drop_marker', drop_marker, true);

    globalThis.debug_map = this._ml;
  },
  _unmounted() {
    this._ml.remove();
  },
  _get_broadcast_listeners() {
    return { 'req_map_navigate': this.on_req_map_navigate };
  },

  get_ml_style() {
    const is_dark = this.$store.is_dark();
    const out_fcoll = this.$cached(this.get_out_fcoll);
    const hl_fcoll = this.$cached(this.get_hl_fcoll);

    const style = {
      version: 8,
      glyphs: glyphs_url + '#/{fontstack}/{range}',
      // glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      transition: {
        duration: 0, // instant theme switch
      },
      sources: {
        'ne_land': { // TODO land -> coastlines
          type: 'geojson',
          data: ne_land_url,
          tolerance: .2,
        },
        'ne_cities': {
          type: 'geojson',
          data: ne_cities_url,
        },
        'sat_esri': {
          type: 'raster',
          tileSize: 256,
          maxzoom: 23,
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        },
        'sat_google': {
          type: 'raster',
          tileSize: 256,
          maxzoom: 22,
          tiles: [
            'https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            'https://mt2.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            'https://mt3.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
          ],
        },
        'sat_bing': {
          type: 'raster',
          tileSize: 256,
          tiles: [
            'http://ecn.t0.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=1',
            'http://ecn.t1.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=1',
            'http://ecn.t2.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=1',
            'http://ecn.t3.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=1',
            'http://ecn.t4.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=1',
            'http://ecn.t5.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=1',
            'http://ecn.t6.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=1',
            'http://ecn.t7.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=1',
          ],
        },

        'features': {
          type: 'geojson',
          data: out_fcoll,
          tolerance: .2,
        },
        'highlight': {
          type: 'geojson',
          data: hl_fcoll,
          tolerance: 0, // show all vertices
        },
      },
      layers: [
        {
          id: 'land',
          type: 'fill',
          source: 'ne_land',
          paint: {
            'fill-color': 'hsl(0 0% 98%)',
            ... is_dark && {
              'fill-color': 'hsl(0 0% 20%)',
            },
          },
        },
        // {
        //   id: 'sat',
        //   type: 'raster',
        //   source: 'sat_google',
        //   paint: {
        //     'raster-opacity': .5,
        //   },
        // },
        {
          id: 'out_fill',
          type: 'fill',
          source: 'features',
          filter: ['in', ['geometry-type'], 'MultiPolygon'],
          paint: {
            'fill-opacity': .4,
            'fill-color': ['to-color', ['concat', 'hsl(', ['get', 'hue'], ' 100% 70%)']],
          },
        },
        {
          id: 'hl_fill',
          type: 'fill',
          source: 'highlight',
          filter: ['in', ['geometry-type'], 'MultiPolygon'],
          paint: {
            'fill-opacity': .2,
            'fill-color': 'hsl(0 0% 33%)',
            ... is_dark && {
              'fill-color': 'hsl(0 0% 93%)',
            },
          },
        },
        {
          id: 'out_line',
          type: 'line',
          source: 'features',
          filter: ['in', ['geometry-type'], 'MultiLineString'],
          paint: {
            'line-width': 2,
            'line-color': ['to-color', ['concat', 'hsl(', ['get', 'hue'], ' 100% 70%)']],
          },
        },
        {
          id: 'hl_path',
          type: 'line',
          source: 'highlight',
          filter: ['in', ['geometry-type'], 'MultiLineString MultiPolygon'],
          paint: {
            'line-width': 1,
            'line-color': 'hsl(0 0% 33%)',
            ... is_dark && {
              'line-color': 'hsl(0 0% 93%)',
            },
          },
        },
        {
          id: 'hl_vertex',
          type: 'circle',
          source: 'highlight',
          filter: ['in', ['geometry-type'], 'MultiLineString MultiPolygon'],
          paint: {
            'circle-radius': 2,
            'circle-color': 'hsl(0 0% 33%)',
            ... is_dark && {
              'circle-color': 'hsl(0 0% 93%)',
            },
          },
        },
        {
          id: 'out_collapsed',
          type: 'circle',
          source: 'features',
          filter: ['<=', ['zoom'], ['coalesce', ['get', 'zoom'], -1]],
          paint: {
            'circle-radius': 2,
            'circle-color': ['to-color', ['concat', 'hsl(', ['get', 'hue'], ' 100% 50% / .6)']],
            ... is_dark && {
              'circle-color': ['to-color', ['concat', 'hsl(', ['get', 'hue'], ' 90% 70% / .6)']],
            },
          },
        },
        {
          id: 'out_point',
          type: 'circle',
          source: 'features',
          filter: [
            'all',
            ['in', ['geometry-type'], 'MultiPoint'],
            ['==', null, ['get', 'zoom']], // not collapsed
          ],
          paint: {
            'circle-radius': 2,
            'circle-stroke-width': 1,
            'circle-color': ['to-color', ['concat', 'hsl(', ['get', 'hue'], ' 100% 50% / .6)']],
            'circle-stroke-color': ['to-color', ['concat', 'hsl(', ['get', 'hue'], ' 100% 30%)']],
            ... is_dark && {
              'circle-color': ['to-color', ['concat', 'hsl(', ['get', 'hue'], ' 90% 50% / .6)']],
              'circle-stroke-color': ['to-color', ['concat', 'hsl(', ['get', 'hue'], ' 100% 70%)']],
            },
          },
        },
        {
          id: 'ne_cities',
          type: 'symbol',
          source: 'ne_cities',
          paint: {
            'text-opacity': .4, // allows features to be visible through city labels
            'text-halo-width': 1,
            'text-color': 'hsl(0 0% 30%)',
            'text-halo-color': 'hsl(0 0% 100%)',
            ... is_dark && {
              'text-color': 'hsl(0 0% 90%)',
              'text-halo-color': 'hsl(0 0% 0%)',
            },
          },
          layout: {
            'text-size': 14,
            'text-field': ['get', 'name'],
            'text-padding': 8,
            'symbol-sort-key': ['get', 'weight'],
            'text-anchor': 'bottom', // prevent features from being overlapped by city labels
          },
        },
        {
          id: 'hl_point',
          type: 'circle',
          source: 'highlight',
          filter: [
            'all',
            ['in', ['geometry-type'], 'MultiPoint'],
            ['<=', ['zoom'], ['coalesce', ['get', 'zoom'], 100]],
          ],
          paint: {
            'circle-radius': 2,
            'circle-color':  'hsl(0 0% 90%)',
            'circle-stroke-width': 2,
            'circle-stroke-color': 'hsl(0 0% 30%)',
            ... is_dark && {
              'circle-stroke-color': 'hsl(0 0% 90%)',
            },
          },
        },
        // {
        //   id: 'hl_point',
        //   type: 'symbol',
        //   filter: ['==', ['geometry-type'], 'Point'],
        //   source: 'highlight',
        //   paint: {
        //     // 'icon-color': '#fff',
        //     // 'icon-halo-color': 'red',
        //     // 'icon-halo-width': 2,
        //   },
        //   layout: {
        //     // 'icon-image': 'drop_marker',
        //     'icon-image': 'drop_white',
        //     'icon-anchor': 'bottom',
        //     'icon-allow-overlap': true,
        //   },
        //   metadata: {
        //     alt_layout: {
        //       'icon-image': 'drop_black',
        //     },
        //   },
        // },
      ],
    };

    return style;
  },


  // TODO split primary and collapsed features to different featurecollections
  // TODO move hue out of featurecollection to make potential hue-slider control possible.
  get_out_fcoll() {
    const golden_angle = 180 * (3 - 5 ** .5); // https://en.wikipedia.org/wiki/Golden_angle
    const granularity = 4 /*marker diameter px*/ / 512 /*world size px*/;
    const features = [];
    // const collapsed = [];
    const { frames } = this.$store.out;
    for (let frame_idx = 0; frame_idx < frames.length; frame_idx++) {
      const { rows, geom_col_idx } = frames[frame_idx];
      if (geom_col_idx < 0 || !rows) continue;
      // TODO fix bad contrast when blue on black bg
      const hue = (200 + frame_idx * golden_angle) % 360;
      for (let row_idx = 0; row_idx < rows.length; row_idx++) {
        const { original } = rows[row_idx];
        if (!original) continue; // TODO support modified
        const geometry = geojson_try_parse(original[geom_col_idx]);
        if (!geometry) continue;
        const bbox = [180, 90, -180, -90];
        for (const singular_geom of geojson_unnest(geometry)) {
          const [w, s, e, n] = geojson_bbox(singular_geom);
          geojson_extend_bbox(bbox, w, s);
          geojson_extend_bbox(bbox, e, n);
          if (singular_geom.type == 'Point') continue; // TODO multipoint
          const lb = MercatorCoordinate.fromLngLat([w, s]);
          const rt = MercatorCoordinate.fromLngLat([e, n]);
          const span = Math.hypot(rt.x - lb.x, rt.y - lb.y);
          const zoom = Math.log2(granularity / span);
          const coordinates = [(w + e) / 2, (s + n) / 2];
          features.push({
            type: 'Feature',
            properties: { frame_idx, row_idx, hue, zoom },
            geometry: { type: 'Point', coordinates },
          });
        }
        features.push({
          type: 'Feature',
          properties: { frame_idx, row_idx, hue },
          geometry,
          bbox,
        });
      }
    }
    const fcoll = { type: 'FeatureCollection', features };
    // hack maplibre to bypass expensive deepClone and deepEqual
    // algorithms during style diff computation
    return { toJSON: _ => fcoll };
  },

  get_hl_fcoll() {
    const { frame_idx, row_idx } = this.$store.get_selected_rowcol();
    const out_fcoll = this.$cached(this.get_out_fcoll).toJSON();
    const features = out_fcoll.features.filter(({ properties: p }) => (
      p.frame_idx == frame_idx &&
      p.row_idx == row_idx
    ));
    return { type: 'FeatureCollection', features };
  },

  // add_svg_image(id, svg, sdf) {
  //   this._ml.addImage(id, { data: [0, 0, 0, 0], width: 1, height: 1 });
  //   const img = new Image();
  //   img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
  //   img.onload = _ => {
  //     img.width *= 2;
  //     img.height *= 2;
  //     this._ml.removeImage(id);
  //     this._ml.addImage(id, img, { pixelRatio: 2, sdf });
  //   };
  // },

  on_map_click({ point }) {
    const pad = { x: 2, y: 2 };
    const qbox = [point.sub(pad), point.add(pad)];
    const feature = (
      // TODO exclude already highlighted feature
      this._ml.queryRenderedFeatures(qbox, { layers: ['out_point', 'out_collapsed', 'out_line'] })[0] ||
      this._ml.queryRenderedFeatures(point, { layers: ['out_fill'] })[0]
    );
    if (!feature) return; // TODO clear highlight
    const { frame_idx, row_idx } = feature.properties;
    this.$store.set_selected_rowcol(frame_idx, row_idx);
    this.$broadcast('req_row_navigate');
    // TODO zoom to feature extent
  },

  on_req_map_navigate() {
    const hl_fcoll = this.$cached(this.get_hl_fcoll);
    const feature = hl_fcoll.features.find(f => f.bbox);
    if (!feature) return;
    const padding = 20; // px
    const { width, height } = this._ml.transform;
    const sw = this._ml.unproject([padding, height - padding]);
    const ne = this._ml.unproject([width - padding, padding]);
    const bounds = new LngLatBounds(sw, ne);
    bounds.extend(feature.bbox);
    this._ml.fitBounds(bounds, { padding });
    // TODO if point then use box of the point and nearest point from dataset
    // this._ml.fitBounds(geom.bbox, { padding: 20 });
  },
};

function geojson_try_parse(maybe_geojson) {
  try {
    return JSON.parse(maybe_geojson);
  } catch {
    return null;
  }
}

function geojson_unnest(geom) {
  switch (geom.type) {
    case 'MultiLineString':
      return geom.coordinates.map(coordinates => ({ type: 'LineString', coordinates }));
    case 'MultiPolygon':
      return geom.coordinates.map(coordinates => ({ type: 'Polygon', coordinates }));
    case 'GeometryCollection':
      return geom.geometries.flatMap(geojson_unnest);
    default:
      return [geom];
  }
}

function geojson_bbox({ type, coordinates }) {
  switch (type) {
    case 'Point':
      return [...coordinates, ...coordinates]; // TODO slice(0, 2)
    case 'Polygon':
      [coordinates] = coordinates; // take exterior ring only
    case 'MultiPoint':
    case 'LineString': {
      const bbox = [180, 90, -180, -90];
      for (const p of coordinates) {
        // [lng, lat] = p // 3x slower
        geojson_extend_bbox(bbox, p[0], p[1]);
      }
      return bbox;
    }
    default:
      throw Error('impossible');
  }
}

function geojson_extend_bbox(bbox, lng, lat) {
  // TODO world wrap
  bbox[0] = Math.min(bbox[0], lng);
  bbox[1] = Math.min(bbox[1], lat);
  bbox[2] = Math.max(bbox[2], lng);
  bbox[3] = Math.max(bbox[3], lat);
}

export default { methods };
