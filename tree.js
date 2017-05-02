const _ = require("underscore");
const assert = require("assert");
const blessed = require('blessed');

const Node = blessed.Node;
const List = blessed.List;

// some unicode icon characters ►▼◊◌○●□▪▫֎☺◘♦

class Tree extends List {
  constructor(options) {
    super();
    if (!(this instanceof Node)) {
      return new Tree(options);
    }


    const scrollbar = {
      ch: ' ',
      track: {
        bg: 'cyan',
      },
      style: {
        inverse: true,
      },
    };

    const style = {
      item: {
        hover: {
          bg: 'blue',
        },
      },
      selected: {
        bg: 'blue',
        bold: true,
      },
    };

    options.border = options.border || 'line';
    options.scrollbar = options.scrollbar || scrollbar;
    options.style     = options.style || style;

    List.call(this, options);

    this.key(['+', 'right', 'l'], this.expandSelected.bind(this));
    this.key(['-', 'left', 'h'], this.collapseSelected.bind(this));

    this.items = [];
    this.selected = 0;
  }

  // Tree.prototype.__proto__ = List.prototype;

  // Tree.prototype.type = 'list';

  toContent(node, isLastChild, parent) {
    node.prefix = parent ? (parent.prefix +  ((parent.isLastChild) ? ' ' :  '│')) : " ";

    const s =  (isLastChild) ? '└' :  '├';

    const level = node.depth;
    assert(level >= 0 && level < 100);

    const hasChildren = node.children && node.children.length > 0;
    //    [+]
    // var c = node.expanded ? (hasChildren ? "┬ ".green : "  ")  : "+ ";
    let c = "► ";
    if (node.expanded) {
      c = (hasChildren ? "▼ ".green : "▼ ".blue);
    }
    const str = node.prefix + s + c + node.name;
    return str;
  }

  _add(node, isLastChild, parent) {
    node.isLastChild = isLastChild;
    const item = this.add(this.toContent(node, isLastChild, parent));
    item.node = node;
    item.on('click', () => {
      if (node.expanded) {
        this.collapseSelected();
      } else {
        this.expandSelected();
      }
    });

    if (this._old_selectedNode === node) {
      this._index_selectedNode = this.items.length - 1;
    }
    /* this.items.forEach((i) => {
      console.log(i.node);
    }); */
  }

  walk(node, depth) {
    if (this.items.length) {
      this._old_selectedNode = this.items[this.selected].node;
      assert(this._old_selectedNode);
    }
    this._index_selectedNode = -1;
    this.setItems([]);

    if (node.name && depth === 0) {
      // root node
      node.depth = 0;
      this._add(node, true, null);
    }

    const dumpChildren = (node, depth) => {
      if (_.isFunction(node.children)) {
        return;
      }
      node.children = node.children || [];
      let i;
      let isLastChild;

      for (i = 0; i < node.children.length; i += 1) {
        const child = node.children[i];
        if (child) {
          child.depth = depth + 1;

          isLastChild = (i === node.children.length - 1);
          this._add(child, isLastChild, node);
          if (child.expanded && !_.isFunction(child.children)) {
            dumpChildren(child, depth + 1);
          }
        }
      }
    }
    if (node.expanded) {
      dumpChildren(node, depth);
    }
    this._index_selectedNode = this._index_selectedNode >= 0 ? this._index_selectedNode : 0;
    this.select(this._index_selectedNode);
  }


  expandSelected() {
    const node = this.items[this.selected].node;

    if (node.expanded) {
      return;
    }
    const dummy = (node, callback) => {
      callback(null, node.children);
    };

    const populateChildren = _.isFunction(node.children) ? node.children : dummy;
    populateChildren(node, (err, children) => {
      assert(_.isArray(children));
      node.children = children;
      node.expanded = true;
      this.setData(this.__data);
    });
  }

  collapseSelected() {
    const node = this.items[this.selected].node;
    if (!node.expanded) {
      return;
    }
    node.expanded = false;
    this.setData(this.__data);
  }

  setData(data) {
    this.__data = data;
    this.walk(data, 0);
    this.screen.render();
  }
}
exports.Tree = Tree;
