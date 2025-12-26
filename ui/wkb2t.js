// https://git.osgeo.org/gitea/postgis/postgis/src/branch/master/doc/bnf-wkb.txt
// https://git.osgeo.org/gitea/postgis/postgis/src/branch/master/doc/bnf-wkt.txt
// https://postgis.net/docs/using_postgis_dbmanagement.html

export function hexwkb2t(hexwkb) {
  let read_pos = 0;
  return read_geometry(true);

  function read_geometry(root) {
    const le = read_n(1).getUint8();
    const xtype = read_n(4).getUint32(0, le);
    const has_z = 'Z'.repeat(Boolean(xtype & 0x80000000));
    const has_m = 'M'.repeat(Boolean(xtype & 0x40000000));
    const has_srid = xtype & 0x20000000;
    const srid = has_srid && read_n(4).getUint32(0, le);

    // https://github.com/postgis/postgis/blob/dea6d0ac1cd0c9a98e9012ce2f61b676d1d7ae45/liblwgeom/liblwgeom_internal.h#L103
    switch (xtype & 0x1fffffff) {
      case 0x01: return build_wkt('POINT', read_xyzm(), true, true);
      case 0x02: return build_wkt('LINESTRING', read_path(), true);
      case 0x03: return build_wkt('POLYGON', read_array(read_path), true);
      case 0x04: return build_wkt('MULTIPOINT', read_array(read_geometry));
      case 0x05: return build_wkt('MULTILINESTRING', read_array(read_geometry));
      case 0x06: return build_wkt('MULTIPOLYGON', read_array(read_geometry));
      case 0x07: return build_wkt('GEOMETRYCOLLECTION', read_array(read_geometry, true));
      case 0x08: return build_wkt('CIRCULARSTRING', read_path());
      case 0x09: return build_wkt('COMPOUNDCURVE', read_array(read_geometry));
      case 0x0a: return build_wkt('CURVEPOLYGON', read_array(read_geometry));
      case 0x0b: return build_wkt('MULTICURVE', read_array(read_geometry));
      case 0x0c: return build_wkt('MULTISURFACE', read_array(read_geometry));
      // case 0x0d: CURVE
      // case 0x0e: SURFACE
      case 0x0f: return build_wkt('POLYHEDRALSURFACE', read_array(read_geometry));
      case 0x10: return build_wkt('TIN', read_array(read_geometry));
      case 0x11: return build_wkt('TRIANGLE', read_array(read_path), true);
    }

    throw Error('unknown wkb type', { cause: { xtype, read_pos } });

    function build_wkt(type, body, collapsible, parens) {
      if (root || !collapsible) {
        if (parens) {
          body = '(' + body + ')';
        }
        body = type + ' ' + has_z + has_m + body;
      }
      if (has_srid) { // expect nested geom to have no srid
        body = 'SRID=' + srid + ';' + body;
      }
      return body;
    }

    function read_xyzm() {
      return (
        read_n(8).getFloat64(0, le) + ' ' +
        read_n(8).getFloat64(0, le) +
        (has_z && ' ' + read_n(8).getFloat64(0, le)) +
        (has_m && ' ' + read_n(8).getFloat64(0, le))
      );
    }

    function read_path() {
      return read_array(read_xyzm);
    }

    function read_array(fn, a1) {
      let res = '';
      for (let n = read_n(4).getUint32(0, le); n--;) {
        res += fn(a1);
        if (n) res += ',\n';
      }
      return '(' + res + ')';
    }
  }

  function read_n(n) {
    for (let i = 0; i < n; i++) {
      dv.setUint8(i, read_u4() << 4 | read_u4());
    }
    return dv;
  }

  function read_u4() {
    const d = hexwkb.charCodeAt(read_pos++);
    if (0x30 <= d && d <= 0x39) return d - 0x30; // 0-9
    if (0x41 <= d && d <= 0x46) return d - (0x41 - 0xa); // A-F
    if (0x61 <= d && d <= 0x66) return d - (0x61 - 0xa); // a-f
    if (isNaN(d)) throw Error('unexpected eof');
    throw Error('invalid hex digit', { cause: { d, read_pos } });
  }
}

const dv = new DataView(new ArrayBuffer(8));
