define(function (require, exports) {
  'use strict';
  var d3 = exports;

  d3.layout = {};

  d3.merge = function(arrays) {
    var n = arrays.length,
        m,
        i = -1,
        j = 0,
        merged,
        array;

    while (++i < n) j += arrays[i].length;
    merged = new Array(j);

    while (--n >= 0) {
      array = arrays[n];
      m = array.length;
      while (--m >= 0) {
        merged[--j] = array[m];
      }
    }

    return merged;
  };

  // Copies a variable number of methods from source to target.
  d3.rebind = function(target, source) {
    var i = 1, n = arguments.length, method;
    while (++i < n) target[method = arguments[i]] = d3_rebind(target, source, source[method]);
    return target;
  };

  // Method is assumed to be a standard D3 getter-setter:
  // If passed with no arguments, gets the value.
  // If passed with arguments, sets the value and returns the target.
  function d3_rebind(target, source, method) {
    return function() {
      var value = method.apply(source, arguments);
      return value === source ? target : value;
    };
  }

  d3.layout.hierarchy = function() {
    var sort = d3_layout_hierarchySort,
        children = d3_layout_hierarchyChildren,
        value = d3_layout_hierarchyValue;

    function hierarchy(root) {
      var stack = [root],
          nodes = [],
          node;

      root.depth = 0;

      while ((node = stack.pop()) != null) {
        nodes.push(node);
        if ((childs = children.call(hierarchy, node, node.depth)) && (n = childs.length)) {
          var n, childs, child;
          while (--n >= 0) {
            stack.push(child = childs[n]);
            child.parent = node;
            child.depth = node.depth + 1;
          }
          if (value) node.value = 0;
          node.children = childs;
        } else {
          if (value) node.value = +value.call(hierarchy, node, node.depth) || 0;
          delete node.children;
        }
      }

      d3_layout_hierarchyVisitAfter(root, function(node) {
        var childs, parent;
        if (sort && (childs = node.children)) childs.sort(sort);
        if (value && (parent = node.parent)) parent.value += node.value;
      });

      return nodes;
    }

    hierarchy.sort = function(x) {
      if (!arguments.length) return sort;
      sort = x;
      return hierarchy;
    };

    hierarchy.children = function(x) {
      if (!arguments.length) return children;
      children = x;
      return hierarchy;
    };

    hierarchy.value = function(x) {
      if (!arguments.length) return value;
      value = x;
      return hierarchy;
    };

    // Re-evaluates the `value` property for the specified hierarchy.
    hierarchy.revalue = function(root) {
      if (value) {
        d3_layout_hierarchyVisitBefore(root, function(node) {
          if (node.children) node.value = 0;
        });
        d3_layout_hierarchyVisitAfter(root, function(node) {
          var parent;
          if (!node.children) node.value = +value.call(hierarchy, node, node.depth) || 0;
          if (parent = node.parent) parent.value += node.value;
        });
      }
      return root;
    };

    return hierarchy;
  };

  // A method assignment helper for hierarchy subclasses.
  function d3_layout_hierarchyRebind(object, hierarchy) {
    d3.rebind(object, hierarchy, Object.keys({
      sort: true,
      children: true,
      value: true
    }));

    // Add an alias for nodes and links, for convenience.
    object.nodes = object;
    object.links = d3_layout_hierarchyLinks;

    return object;
  }

  // Pre-order traversal.
  function d3_layout_hierarchyVisitBefore(node, callback) {
    var nodes = [node];
    while ((node = nodes.pop()) != null) {
      callback(node);
      if ((children = node.children) && (n = children.length)) {
        var n, children;
        while (--n >= 0) nodes.push(children[n]);
      }
    }
  }

  // Post-order traversal.
  function d3_layout_hierarchyVisitAfter(node, callback) {
    var nodes = [node], nodes2 = [];
    while ((node = nodes.pop()) != null) {
      nodes2.push(node);
      if ((children = node.children) && (n = children.length)) {
        var i = -1, n, children;
        while (++i < n) nodes.push(children[i]);
      }
    }
    while ((node = nodes2.pop()) != null) {
      callback(node);
    }
  }

  function d3_layout_hierarchyChildren(d) {
    return d.children;
  }

  function d3_layout_hierarchyValue(d) {
    return d.value;
  }

  function d3_layout_hierarchySort(a, b) {
    return b.value - a.value;
  }

  // Returns an array source+target objects for the specified nodes.
  function d3_layout_hierarchyLinks(nodes) {
    return d3.merge(nodes.map(function(parent) {
      return (parent.children || []).map(function(child) {
        return {source: parent, target: child};
      });
    }));
  }

  // Node-link tree diagram using the Reingold-Tilford "tidy" algorithm
  d3.layout.tree = function() {
    var hierarchy = d3.layout.hierarchy().sort(null).value(null),
        separation = d3_layout_treeSeparation,
        size = [1, 1], // width, height
        nodeSize = null;

    function tree(d, i) {
      var nodes = hierarchy.call(this, d, i),
          root0 = nodes[0],
          root1 = wrapTree(root0);

      // Compute the layout using Buchheim et al.'s algorithm.
      d3_layout_hierarchyVisitAfter(root1, firstWalk), root1.parent.m = -root1.z;
      d3_layout_hierarchyVisitBefore(root1, secondWalk);

      // If a fixed node size is specified, scale x and y.
      if (nodeSize) d3_layout_hierarchyVisitBefore(root0, sizeNode);

      // If a fixed tree size is specified, scale x and y based on the extent.
      // Compute the left-most, right-most, and depth-most nodes for extents.
      else {
        var left = root0,
            right = root0,
            bottom = root0;
        d3_layout_hierarchyVisitBefore(root0, function(node) {
          if (node.x < left.x) left = node;
          if (node.x > right.x) right = node;
          if (node.depth > bottom.depth) bottom = node;
        });
        var tx = separation(left, right) / 2 - left.x,
            kx = size[0] / (right.x + separation(right, left) / 2 + tx),
            ky = size[1] / (bottom.depth || 1);
        d3_layout_hierarchyVisitBefore(root0, function(node) {
          node.x = (node.x + tx) * kx;
          node.y = node.depth * ky;
        });
      }

      return nodes;
    }

    function wrapTree(root0) {
      var root1 = {A: null, children: [root0]},
          queue = [root1],
          node1;

      while ((node1 = queue.pop()) != null) {
        for (var children = node1.children, child, i = 0, n = children.length; i < n; ++i) {
          queue.push((children[i] = child = {
            _: children[i], // source node
            parent: node1,
            children: (child = children[i].children) && child.slice() || [],
            A: null, // default ancestor
            a: null, // ancestor
            z: 0, // prelim
            m: 0, // mod
            c: 0, // change
            s: 0, // shift
            t: null, // thread
            i: i // number
          }).a = child);
        }
      }

      return root1.children[0];
    }

    // FIRST WALK
    // Computes a preliminary x-coordinate for v. Before that, FIRST WALK is
    // applied recursively to the children of v, as well as the function
    // APPORTION. After spacing out the children by calling EXECUTE SHIFTS, the
    // node v is placed to the midpoint of its outermost children.
    function firstWalk(v) {
      var children = v.children,
          siblings = v.parent.children,
          w = v.i ? siblings[v.i - 1] : null;
      if (children.length) {
        d3_layout_treeShift(v);
        var midpoint = (children[0].z + children[children.length - 1].z) / 2;
        if (w) {
          v.z = w.z + separation(v._, w._);
          v.m = v.z - midpoint;
        } else {
          v.z = midpoint;
        }
      } else if (w) {
        v.z = w.z + separation(v._, w._);
      }
      v.parent.A = apportion(v, w, v.parent.A || siblings[0]);
    }

    // SECOND WALK
    // Computes all real x-coordinates by summing up the modifiers recursively.
    function secondWalk(v) {
      v._.x = v.z + v.parent.m;
      v.m += v.parent.m;
    }

    // APPORTION
    // The core of the algorithm. Here, a new subtree is combined with the
    // previous subtrees. Threads are used to traverse the inside and outside
    // contours of the left and right subtree up to the highest common level. The
    // vertices used for the traversals are vi+, vi-, vo-, and vo+, where the
    // superscript o means outside and i means inside, the subscript - means left
    // subtree and + means right subtree. For summing up the modifiers along the
    // contour, we use respective variables si+, si-, so-, and so+. Whenever two
    // nodes of the inside contours conflict, we compute the left one of the
    // greatest uncommon ancestors using the function ANCESTOR and call MOVE
    // SUBTREE to shift the subtree and prepare the shifts of smaller subtrees.
    // Finally, we add a new thread (if necessary).
    function apportion(v, w, ancestor) {
      if (w) {
        var vip = v,
            vop = v,
            vim = w,
            vom = vip.parent.children[0],
            sip = vip.m,
            sop = vop.m,
            sim = vim.m,
            som = vom.m,
            shift;
        while (vim = d3_layout_treeRight(vim), vip = d3_layout_treeLeft(vip), vim && vip) {
          vom = d3_layout_treeLeft(vom);
          vop = d3_layout_treeRight(vop);
          vop.a = v;
          shift = vim.z + sim - vip.z - sip + separation(vim._, vip._);
          if (shift > 0) {
            d3_layout_treeMove(d3_layout_treeAncestor(vim, v, ancestor), v, shift);
            sip += shift;
            sop += shift;
          }
          sim += vim.m;
          sip += vip.m;
          som += vom.m;
          sop += vop.m;
        }
        if (vim && !d3_layout_treeRight(vop)) {
          vop.t = vim;
          vop.m += sim - sop;
        }
        if (vip && !d3_layout_treeLeft(vom)) {
          vom.t = vip;
          vom.m += sip - som;
          ancestor = v;
        }
      }
      return ancestor;
    }

    function sizeNode(node) {
      node.x *= size[0];
      node.y = node.depth * size[1];
    }

    tree.separation = function(x) {
      if (!arguments.length) return separation;
      separation = x;
      return tree;
    };

    tree.size = function(x) {
      if (!arguments.length) return nodeSize ? null : size;
      nodeSize = (size = x) == null ? sizeNode : null;
      return tree;
    };

    tree.nodeSize = function(x) {
      if (!arguments.length) return nodeSize ? size : null;
      nodeSize = (size = x) == null ? null : sizeNode;
      return tree;
    };

    return d3_layout_hierarchyRebind(tree, hierarchy);
  };

  function d3_layout_treeSeparation(a, b) {
    return a.parent == b.parent ? 1 : 2;
  }

  // function d3_layout_treeSeparationRadial(a, b) {
  //   return (a.parent == b.parent ? 1 : 2) / a.depth;
  // }

  // NEXT LEFT
  // This function is used to traverse the left contour of a subtree (or
  // subforest). It returns the successor of v on this contour. This successor is
  // either given by the leftmost child of v or by the thread of v. The function
  // returns null if and only if v is on the highest level of its subtree.
  function d3_layout_treeLeft(v) {
    var children = v.children;
    return children.length ? children[0] : v.t;
  }

  // NEXT RIGHT
  // This function works analogously to NEXT LEFT.
  function d3_layout_treeRight(v) {
    var children = v.children, n;
    return (n = children.length) ? children[n - 1] : v.t;
  }

  // MOVE SUBTREE
  // Shifts the current subtree rooted at w+. This is done by increasing
  // prelim(w+) and mod(w+) by shift.
  function d3_layout_treeMove(wm, wp, shift) {
    var change = shift / (wp.i - wm.i);
    wp.c -= change;
    wp.s += shift;
    wm.c += change;
    wp.z += shift;
    wp.m += shift;
  }

  // EXECUTE SHIFTS
  // All other shifts, applied to the smaller subtrees between w- and w+, are
  // performed by this function. To prepare the shifts, we have to adjust
  // change(w+), shift(w+), and change(w-).
  function d3_layout_treeShift(v) {
    var shift = 0,
        change = 0,
        children = v.children,
        i = children.length,
        w;
    while (--i >= 0) {
      w = children[i];
      w.z += shift;
      w.m += shift;
      shift += w.s + (change += w.c);
    }
  }

  // ANCESTOR
  // If vi-’s ancestor is a sibling of v, returns vi-’s ancestor. Otherwise,
  // returns the specified (default) ancestor.
  function d3_layout_treeAncestor(vim, v, ancestor) {
    return vim.a.parent === v.parent ? vim.a : ancestor;
  }



  function d3_functor(v) {
    return typeof v === "function" ? v : function() { return v; };
  }

  d3.functor = d3_functor;

  function d3_source(d) {
    return d.source;
  }

  function d3_target(d) {
    return d.target;
  }

  d3.svg = {};

  d3.svg.diagonal = function() {
    var source = d3_source,
        target = d3_target,
        projection = d3_svg_diagonalProjection;

    function diagonal(d, i) {
      var p0 = source.call(this, d, i),
          p3 = target.call(this, d, i),
          m = (p0.y + p3.y) / 2,
          p = [p0, {x: p0.x, y: m}, {x: p3.x, y: m}, p3];
      p = p.map(projection);
      return "M" + p[0] + "C" + p[1] + " " + p[2] + " " + p[3];
    }

    diagonal.source = function(x) {
      if (!arguments.length) return source;
      source = d3_functor(x);
      return diagonal;
    };

    diagonal.target = function(x) {
      if (!arguments.length) return target;
      target = d3_functor(x);
      return diagonal;
    };

    diagonal.projection = function(x) {
      if (!arguments.length) return projection;
      projection = x;
      return diagonal;
    };

    return diagonal;
  };

  function d3_svg_diagonalProjection(d) {
    return [d.x, d.y];
  }
});