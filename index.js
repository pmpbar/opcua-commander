require("colors");
const _ = require("underscore");
const assert = require("assert");
const blessed = require('blessed');
const contrib = require("blessed-contrib");
const Tree = require("./tree").Tree;
const opcua = require("node-opcua");
const format = require("util").format;
const NodeClass = require("node-opcua/lib/datamodel/nodeclass").NodeClass;

const attributeIdtoString = _.invert(opcua.AttributeIds);
const DataTypeIdsToString = _.invert(opcua.DataTypeIds);

opcua.NodeClass = NodeClass;

const argv = require('yargs')
  .wrap(132)

  .demand("endpoint")
  .string("endpoint")
  .describe("endpoint", "the end point to connect to ")

  .string("securityMode")
  .describe("securityMode", "the security mode")

  .string("securityPolicy")
  .describe("securityPolicy", "the policy mode")

  .string("userName")
  .describe("userName", "specify the user name of a UserNameIdentityToken ")

  .string("password")
  .describe("password", "specify the password of a UserNameIdentityToken")

  .string("node")
  .describe("node", "the nodeId of the value to monitor")

  .string("history")
  .describe("history", "make an historical read")

  .alias('e', 'endpoint')
  .alias('s', 'securityMode')
  .alias('P', 'securityPolicy')
  .alias("u", 'userName')
  .alias("p", 'password')
  .alias("n", 'node')
  .alias("t", 'timeout')

  .example("opcua-commander  --endpoint opc.tcp://localhost:49230 -P=Basic256 -s=SIGN")
  .example("opcua-commander  -e opc.tcp://localhost:49230 -P=Basic256 -s=SIGN -u JoeDoe -p P@338@rd ")
  .example("opcua-commander  --endpoint opc.tcp://localhost:49230  -n=\"ns=0;i=2258\"")

  .argv;


const securityMode = opcua.MessageSecurityMode.get(argv.securityMode || "NONE");
if (!securityMode) {
  throw new Error(`Invalid Security mode , should be ${opcua.MessageSecurityMode.enums.join(" ")}`);
}

const securityPolicy = opcua.SecurityPolicy.get(argv.securityPolicy || "None");
if (!securityPolicy) {
  throw new Error(`Invalid securityPolicy , should be ${opcua.SecurityPolicy.enums.join(" ")}`);
}

const endpointUrl = argv.endpoint || "opc.tcp://localhost:26543";

if (!endpointUrl) {
  require('yargs').showHelp();
  return;
}


const options = {
  securityMode,
  securityPolicy,
  defaultSecureTokenLifetime: 40000,
};
const client = new opcua.OPCUAClient(options);

let gSession = null;

let populateTree;

let gSubscription = null;

let monitoredItemsList = null;

function createSubscription() {
  assert(gSession);
  const parameters = {
    requestedPublishingInterval: 100,
    requestedLifetimeCount: 1000,
    requestedMaxKeepAliveCount: 12,
    maxNotificationsPerPublish: 100,
    publishingEnabled: true,
    priority: 10,
  };
  gSubscription = new opcua.ClientSubscription(gSession, parameters);
}


client.connect(endpointUrl, () => {
  let userIdentity = null; // anonymous
  if (argv.userName && argv.password) {
    userIdentity = {
      userName: argv.userName,
      password: argv.password,
    };
  }

  client.createSession(userIdentity, (err, session) => {
    if (!err) {
      gSession = session;
      createSubscription();
      populateTree();
    } else {
      console.log(" Cannot create session ", err.toString());
      process.exit(-1);
    }

    // callback(err);
  });
});

function disconnect() {
  gSession.close(() => {
    client.disconnect((err) => {
      if (!err) {
        console.log('Client disconnected');
      } else {
        console.log(err);
      }
    });
  });
}


const monitoredItemsListData = [];

function monitorItem(treeItem) {
  const node = treeItem.node;

  const monitoredItem = gSubscription.monitor({
    nodeId: node.nodeId,
    attributeId: opcua.AttributeIds.Value,
  },
    {
      samplingInterval: 1000,
      discardOldest: true,
      queueSize: 100,
    });
  // subscription.on("item_added",function(monitoredItem){
  // xx monitoredItem.on("initialized",function(){ });
  // xx monitoredItem.on("terminated",function(value){ });


  node.monitoredItem = monitoredItem;

  // const browseName = treeItem.browseName || node.nodeId.toString();

  const monitoredItemData = [node.browseName, node.nodeId.toString(), 'Q'];
  monitoredItemsListData.push(monitoredItemData);
  monitoredItemsList.setRows(monitoredItemsListData);
  /* if (false) {
    const series1 = {
      title: browseName,
      x: [],
      y: []
    };
    line.setData(series1);
  } */


  monitoredItem.on("changed", (dataValue) => {
    // console.log(" value ", node.browseName, node.nodeId.toString(), " changed to ", dataValue.value.toString().green);
    if (dataValue.value.value.toFixed) {
      node.valueAsString = w(dataValue.value.value.toFixed(3), 16);
    } else {
      node.valueAsString = w(dataValue.value.value.toString(), 16);
    }

    // xx series1.title =  browseName+ " = " + dataValue.value.toString();
    // xx series1.x.push(series1.x.length+1);
    // xx series1.y.push(dataValue.value.value);
    // xx sqline.setData(series1);
    monitoredItemData[2] = node.valueAsString;
    monitoredItemsList.setRows(monitoredItemsListData);
    monitoredItemsList.render();
  });
}

function unmonitorItem(treeItem) {
  const node = treeItem.node;
  const browseName = treeItem.browseName || node.nodeId.toString();

  // teminate subscription
  node.monitoredItem.terminate();

  let index = -1;
  monitoredItemsListData.forEach((entry, i) => {
    if (entry[1] === node.nodeId.toString()) {
      index = i;
    }
  });
  if (index > -1) {
    monitoredItemsListData.splice(index, 1);
  }

  node.monitoredItem = null;

  if (monitoredItemsListData.length > 0) {
    monitoredItemsList.setRows(monitoredItemsListData);
  } else {
    // when using setRows with empty array, the view does not update.
    // setting an empty row.
    const empty = [[" "]];
    monitoredItemsList.setRows(empty);
  }
  monitoredItemsList.render();
}

/**
 * @param options.class
 * @param options.nodeId
 * @param options.arrow
 * @constructor
 */
function TreeItem(options) {
  const self = this;
  Object.keys(options).forEach((k) => {
    self[k] = options[k];
  });
}
TreeItem.prototype.__defineGetter__("name", function () {
    return this.arrow;
});

TreeItem.prototype.__defineGetter__("name", function () {
  let str = `${this.arrow}  ${this.browseName}`;
  if (this.class === opcua.NodeClass.Variable) {
    str += ` = ${this.valueAsString}`;
  }
  return str;
});


function expandOpcuaNode(node, callback) {
  if (!gSession) {
    return callback(new Error("No Connection"));
  }
  const children = [];

  const b = [
    {
      nodeId: node.nodeId,
      referenceTypeId: "Organizes",
      includeSubtypes: true,
      browseDirection: opcua.browse_service.BrowseDirection.Forward,
      resultMask: 0x3f,

    },
    {
      nodeId: node.nodeId,
      referenceTypeId: "Aggregates",
      includeSubtypes: true,
      browseDirection: opcua.browse_service.BrowseDirection.Forward,
      resultMask: 0x3f,
    },
  ];

  gSession.browse(b, (err, results) => {
    if (!err) {
      let result = results[0];
      for (let i = 0; i < result.references.length; i += 1) {
        const ref = result.references[i];
        children.push(new TreeItem({
          arrow: "o-> ",
          browseName: ref.browseName.toString(),
          nodeId: ref.nodeId,
          class: ref.class,
          children: expandOpcuaNode,
        }));
      }

      result = results[1];
      for (let i = 0; i < result.references.length; i += 1) {
        const ref = result.references[i];
        children.push(new TreeItem({
          arrow: "+-> ",
          browseName: ref.browseName.toString(),
          nodeId: ref.nodeId,
          class: ref.class,
          children: expandOpcuaNode,
        }));
      }
    }
    callback(err, children);
  });
}


// Create a screen object.
const screen = blessed.screen({
  smartCSR: true,
  autoPadding: false,
  fullUnicode: true,
});
screen.title = 'OPCUA CLI-Client';

// create the main area
const area1 = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: '90%-10',
});
screen.append(area1);
const area2 = blessed.box({
  top: '90%-9',
  left: 0,
  width: '100%',
  height: 'shrink',

});
screen.append(area2);

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
  focus: {
    border: {
      fg: 'yellow',
    },
    bold: false,
  },
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
const w1 = 'left';
const w2 = '40%';
const w3 = '70%';

let attributeList = null;

function w(s, l, c) {
  c = c || " ";
  const filling = Array(25).join(c[0]);
  return (s + filling).substr(0, l);
}
function makeItems(arr) {
  return arr.map(a => `${w(a[0], 25, ".")}: ${w(a[1], attributeList.width - 28)}`);
}
function renderAttributeList() {
  attributeList = blessed.list({
    parent: area1,
    label: ' {bold}{cyan-fg}Attribute List{/cyan-fg}{/bold} ',
    top: 0,
    tags: true,
    left: `${w2}+1`,
    width: '60%-1',
    height: '50%',
    border: 'line',
    noCellBorders: true,
    scrollbar,
    style: _.clone(style),
    align: "left",
    keys: true,
    vi: true,
    mouse: true,
  });
  area1.append(attributeList);

  attributeList.setItems(makeItems([]));
}

function d(dataValue) {
  if (!dataValue.value || dataValue.value.value === null) {
    return `<???> : ${dataValue.statusCode.toString()}`;
  }
  switch (dataValue.value.arrayType) {
    case opcua.VariantArrayType.Scalar:
      return dataValue.value.value.toString();
    case opcua.VariantArrayType.Array:
      return `l= ${dataValue.value.value.length} [ ${dataValue.value.value[0]}... ]`;
    default:
      return '';
  }
}

function formatNode(attribute, dataValue) {
  if (!dataValue || !dataValue.value  || !Object.hasOwnProperty.call(dataValue.value, "value")) {
    return "<null>";
  }
  switch (attribute) {
    case opcua.AttributeIds.DataType:
      return `${DataTypeIdsToString[dataValue.value.value.value]} (${dataValue.value.value.toString()})`;
    case opcua.AttributeIds.NodeClass:
      return `${NodeClass.get(dataValue.value.value).key} (${dataValue.value.value})`;
    case opcua.AttributeIds.WriteMask:
    case opcua.AttributeIds.UserWriteMask:
      return ` (${dataValue.value.value})`;
    case opcua.AttributeIds.UserAccessLevel:
    case opcua.AttributeIds.AccessLevel:
      return `${opcua.AccessLevelFlag.get(dataValue.value.value).key} (${dataValue.value.value})`;
    default:
      return d(dataValue);
  }
}

function fillAttributesRegion(node) {
  const attr = [];
  gSession.readAllAttributes(node.nodeId, (err, nodesToRead, dataValues) => {
    if (!err) {
      let i;
      for (i = 0; i < nodesToRead.length; i += 1) {
        const nodeToRead = nodesToRead[i];
        const dataValue = dataValues[i];
        if (dataValue.statusCode !== opcua.StatusCodes.Good) {
          continue;
        }
        const s = formatNode(nodeToRead.attributeId, dataValue);

        const a = s.split("\n");
        if (a.length === 1) {
          attr.push([attributeIdtoString[nodeToRead.attributeId], s]);
        } else {
          attr.push([attributeIdtoString[nodeToRead.attributeId], a[0]]);
          for (i = 1; i < a.length; i += 1) {
            attr.push(["   |    ", a[i]]);
          }
        }
      }
      attributeList.setItems(makeItems(attr));
      attributeList.screen.render();
    } else {
      console.log("#readAllAttributes returned ", err.message);
    }
  });
}

let refreshTimer = 0;
let tree;
function renderAddressSpaceExplorer() {
  tree = new Tree({
    parent: area1,
    tags: true,
    fg: 'green',
    label: ' {bold}{cyan-fg}Address Space{/cyan-fg}{/bold} ',
    top: 'top',
    left: 'left',
    width: '40%',
    height: '100%',
    keys: true,
    vi: true,
    mouse: true,
    border: 'line',
    style: _.clone(style),
  });

  // allow control the table with the keyboard
  tree.on('select', (treeItem, index) => {
    if (treeItem) {
      fillAttributesRegion(treeItem.node);
    }
  });
  tree.on('keypress', (ch, key) => {
    const keys = ['up', 'down', 'j', 'k'];
    if (keys.some(k => k === key)) {
      if (refreshTimer) {
        return;
      }
      refreshTimer = setTimeout(() => {
        const treeItem = tree.items[tree.selected];
        if (treeItem && treeItem.node) {
          fillAttributesRegion(treeItem.node);
        }
        refreshTimer = 0;
      }, 100);
    }
  });

  area1.append(tree);


  populateTree = () => {
    tree.setData({
      name: "RootFolder",
      nodeId: opcua.resolveNodeId("RootFolder"),
      children: expandOpcuaNode,
    });
  };

  tree.focus();
}

function renderMonitoredItemsWindow() {
  monitoredItemsList = blessed.listtable(
    {
      parent: area1,
      tags: true,
      top: "50%",
      left: `${w2}+1`,
      width: '60%-1',
      height: '50%',
      keys: true,
      vi: true,
      mouse: true,
      label: ' Monitored Items ',
      border: 'line',
      scrollbar,
      noCellBorders: true,
      style: _.clone(style),
      align: "left",
    });

  area1.append(monitoredItemsList);

  // xx monitoredItemsList.setRows([["1","a"]])
}

let line = null;
function renderGraphWindow() {
  line = contrib.line(
    {
      top: "40%+1",
      left: `${w2}-1`,
      width: '70%-1',
      height: '40%-8',
      keys: true,
      mouse: true,
      vi: true,
      style: {
        line: "yellow",
        text: "green",
        baseline: "black",
      },
      xLabelPadding: 3,
      xPadding: 5,
      showLegend: true,
      wholeNumbersOnly: false, // true=do not show fraction in y axis
      label: 'Title',
    });

  screen.append(line);

  const series1 = {
    title: 'apples',
    x: ['t1', 't2', 't3', 't4'],
    y: [5, 1, 7, 5],
  };
  line.setData(series1);
}

function renderLogWindow() {
  const logWindow = blessed.list({

    parent: area2,
    tags: true,
    label: ' {bold}{cyan-fg}Info{/cyan-fg}{/bold} ',
    top: 'top',
    left: 'left',
    width: '100%',
    height: '100%-4',
    keys: true,
    vi: true,
    mouse: true,
    border: 'line',
    scrollable: true,
    scrollbar: {
      ch: ' ',
      track: {
        bg: 'cyan',
      },
      style: {
        inverse: true,
      },
    },
    style: _.clone(style),
  });

  let lines;
  console.log = function() {
    const str = format.apply(null, arguments);
    lines = str.split("\n");
    lines.forEach((str) => {
      logWindow.addItem(str);
    });
    logWindow.select(logWindow.items.length - 1);
    // xx   screen.render();
  };

  area2.append(logWindow);

  const menuBar = blessed.listbar({
    parent: area2,
    top: '100%-2',
    left: 'left',
    width: '100%',
    height: 2,
    keys: true,
    vi: true,
    mouse: true,
    style: {
      prefix: {
        fg: 'white',
      },
    },
    // xx label: ' {bold}{cyan-fg}Info{/cyan-fg}{/bold}',
    // xx border: 'line',
    bg: 'cyan',
  });

  area2.append(menuBar);
  menuBar.setItems({
    Monitor: {
      // xx prefix: 'M',
      keys: ['m'],
      callback: () => {
        const treeItem = tree.items[tree.selected];
        if (treeItem.node.monitoredItem) {
          console.log(" Already monitoring ", treeItem.node.nodeId.toString());
          return;
        }
        monitorItem(treeItem);
      },
    },
    Exit: {
      keys: ['C-c', 'escape'],
      callback: () => process.exit(0),
    },
    Next: {
      keys: ['tab'],
      callback: () => {
        // Note: Need to create array to iterate through
        //console.log("next tab")
      },
    },

    // screen.key(['l'], function (ch, key) {
    Tree: {
      keys: ['t'],
      callback: () => tree.focus(),
    },
    Attributes: {
      keys: ['a'],
      callback: () => {
        // console.log("setting focus to list");
        attributeList.focus();
      },
    },
    Info: {
      keys: ['i'],
      callback: () => {
        // console.log("setting focus to info");
        logWindow.focus();
      },
    },
    Clear: {
      keys: ['c'],
      callback: () => {
        logWindow.clearItems();
        logWindow.screen.render();
      },
    },
    Unmonitor: {
      keys: ['u'],
      callback: () => {
        const treeItem = tree.items[tree.selected];
        if (!treeItem.node.monitoredItem) {
          console.log(treeItem.node.nodeId.toString(), " was not being monitored");
          return;
        }
        unmonitorItem(treeItem);
      },
    },
  });
}

renderAddressSpaceExplorer();
// xx renderGraphWindow();
renderAttributeList();
renderMonitoredItemsWindow();
renderLogWindow();


// Render the screen.
screen.render();
console.log(" Welcome to Node-OPCUA CLI".red, "  Client".green);
console.log("   endpoint url   = ".cyan, endpointUrl.toString());
console.log("   securityMode   = ".cyan, securityMode.toString());
console.log("   securityPolicy = ".cyan, securityPolicy.toString());
