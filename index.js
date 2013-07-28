var fs = require('fs')
var path = require('path')

var node_env = process.env.NODE_ENV || 'development';

var INCLUDE_MATCHER_JS = /^\/\/(?:=?)(?:\s*)(require|include)(?:\(|\s)(?:\s*)(?:(?:["']?)((?:\w|\/|-|\.)+)(?:["']?)(?:\)?)(?:\s*?))$/mg
var INCLUDE_TREE_MATCHER_JS = /^\/\/(?:=?)(?:\s*)(require_tree|include_tree)(?:\(|\s)(?:\s*)(?:(?:["']?)((?:\w|\/|-|\.)+)(?:["']?)(?:\)?)(?:\s*?))$/mg
var INCLUDE_MATCHER_COFFEE = /^#(?:=?)(?:\s*)(require|include)(?:\(|\s)(?:\s*)(?:(?:["']?)((?:\w|\/|-|\.)+)(?:["']?)(?:\)?)(?:\s*?))$/mg
var INCLUDE_TREE_MATCHER_COFFEE = /^#(?:=?)(?:\s*)(require_tree|include_tree)(?:\(|\s)(?:\s*)(?:(?:["']?)((?:\w|\/|-|\.)+)(?:["']?)(?:\)?)(?:\s*?))$/mg
var INCLUDE_MATCHER = new RegExp("(?:"+INCLUDE_MATCHER_JS.source+")|(?:"+INCLUDE_MATCHER_COFFEE.source+")", "mg")

try { var CoffeeScript = require('coffee-script') } catch(e) {}
var _compilers = {
  coffee: function _compileCoffee(source, opts) { return CoffeeScript.compile(source, opts) }
}

function accets(arg0) {
  if (!arg0) { throw new Error("accets() requires a path or object") }
  var source = new AccetSource()
  Array.prototype.forEach.call(arguments, function(arg){
    source.import(arg)
  })
  return source
}
module.exports = accets
accets.INCLUDE_MATCHER = INCLUDE_MATCHER
accets._compilers = _compilers

function AccetSource() {
  this._imports = []
  this._root_files = []
  this._map = {}
}

AccetSource.prototype.import = function(arg) {
  if (arg instanceof AccetSource) {
    this._imports.push(arg)
  } else if ((typeof arg)==='string'||arg instanceof String) {
    var stat = fs.statSync(path.resolve(arg))
    if (stat.isDirectory()) {
      // dst.importDir(arg)
      var pthLst = fs.readdirSync(path.resolve(arg))
      for (var i = 0; i < pthLst.length; ++i) {
        var pth = pthLst[i]
        var fullPth = path.join(arg,pth)
        var lpid = pth.lastIndexOf('.')
        var pth = (lpid < 0) ? pth : pth.slice(0, lpid)
        this._map[pth] = new AccetSource()
        this._map[pth].import(this)
        this._map[pth].import(fullPth)
      }
    } else if (stat.isFile()) {
      this._root_files.push(path.resolve(arg))
    } else {
      throw new Error('invalid file type for ',arg)
    }
  } else if ((typeof arg)==='object') {
    var kys = Object.keys(arg)
    for (var i = 0; i < kys.length; ++i) {
      if (arg[kys[i]] instanceof AccetSource) {
        this._map[kys[i]] = arg[kys[i]]
      } else {
        this._map[kys[i]] = new AccetSource()
        this._map[kys[i]].import(arg[kys[i]])
      }
    }
  } else {
    throw new Error("cannot import ",arg)
  }
}

AccetSource.prototype.build = function() {
  if (node_env=='production'&&this._cache) {
    return this._cache
  }
  var inst = this
  var preq_str = ""
  var root_str = ""
  for (var i = 0; i < inst._imports.length; ++i) {
    root_str += inst._imports[0].build()
  }
  for (var i = 0; i < inst._root_files.length; ++i) {
    var root_file = inst._root_files[i]
    var lpid = root_file.lastIndexOf('.'),
      ext = (lpid < 0) ? '' : root_file.slice(lpid+1).toLowerCase()
    var fbuf = fs.readFileSync(root_file, {encoding: 'utf8'})
    function _stripAndResolveRequires(mtch, mode, rel) {
      var depAcc = inst.resolve(rel)
      if (!depAcc) { throw new Error("could not resolve \""+rel+"\" in file "+root_file) }
      preq_str += depAcc.build()
      return ""
    }
    function _stripAndResolveRequireTrees(mtch, mode, rel) {
      var depAcc = inst.resolve(rel)
      if (!depAcc) { throw new Error("could not resolve \""+rel+"\" in file "+root_file) }
      var dep_keys = Object.keys(depAcc._map)
      for (var m = 0; m < dep_keys.length; ++m) {
        preq_str += depAcc._map[dep_keys[m]].build()
      }
      return ""
    }
    if (ext==='js') {
      fbuf = fbuf.replace(INCLUDE_MATCHER_JS, _stripAndResolveRequires)
      fbuf = fbuf.replace(INCLUDE_TREE_MATCHER_JS, _stripAndResolveRequireTrees)
    } else if (ext==='coffee') {
      fbuf = fbuf.replace(INCLUDE_MATCHER_COFFEE, _stripAndResolveRequires)
      fbuf = fbuf.replace(INCLUDE_TREE_MATCHER_COFFEE, _stripAndResolveRequireTrees)
    }
    if (ext in _compilers) {
      fbuf = _compilers[ext](fbuf, {filename: root_file})
    }
    root_str += fbuf
  }
  this._cache = preq_str+root_str
  return this._cache
}

AccetSource.prototype.resolve = function(rel) {
  if (!((typeof rel)==='string' || rel instanceof String)) { throw new Error('rel must be a string') }
  if (/\.js$/.test(rel)) { rel = rel.slice(0,rel.length-3) }
  if (/\.css$/.test(rel)) { rel = rel.slice(0,rel.length-4) }
  var prts = rel.split('/')
  var node = this
  for (var i = 0; i < prts.length; ++i) {
    if (!(node instanceof AccetSource)) {
      throw new Error('node must be instance of AccetSource')
    }
    if (node._map[prts[i]]) {
      node = node._map[prts[i]]
    } else {
      var importList = node._imports
      node = null
      for (var j = 0; j < importList.length; ++j) {
        if (node = importList[j].resolve(prts[i])) {
          break
        }
      }
      if (!node) {
        return null
      }
    }
  }
  return node
}

AccetSource.prototype.makeFileList = function() {
  var inst = this
  var fileList = []
  for (var i = 0; i < inst._imports.length; ++i) {
    fileList = (inst._imports[i].makeFileList()).concat(fileList)
  }
  for (var i = 0; i < inst._root_files.length; ++i) {
    try {
      var ext = /\.([a-zA-Z0-9]+)$/.exec(inst._root_files[i])[1]
    } catch(e) {}
    fbuf = fs.readFileSync(inst._root_files[i], {encoding: 'utf8'})
    function _stripAndAppendRequires(mtch, mode, rel) {
      fileList = fileList.concat(inst.resolve(rel).makeFileList())
      return ""
    }
    function _stripAndAppendRequireTrees(mtch, mode, rel) {
      var depAcc = inst.resolve(rel)
      if (!depAcc) { throw new Error("could not resolve \""+rel+"\" in file "+root_file) }
      var dep_keys = Object.keys(depAcc._map)
      for (var m = 0; m < dep_keys.length; ++m) {
        fileList = fileList.concat(depAcc._map[dep_keys[m]].makeFileList())
      }
      return ""
    }
    if (ext==='js') {
      fbuf = fbuf.replace(INCLUDE_MATCHER_JS, _stripAndAppendRequires)
      fbuf = fbuf.replace(INCLUDE_TREE_MATCHER_JS, _stripAndAppendRequireTrees)
    } else if (ext==='coffee') {
      fbuf = fbuf.replace(INCLUDE_MATCHER_COFFEE, _stripAndAppendRequires)
      fbuf = fbuf.replace(INCLUDE_TREE_MATCHER_COFFEE, _stripAndAppendRequireTrees)
    }
    fileList.push(inst._root_files[i])
  }
  return fileList
}

AccetSource.prototype.middleware = function() {
  var inst = this
  return function accetsMiddlware(req,res,next) {
    if (req.url.indexOf('/js/')===0) {
      res.set({'Content-Type': 'text/javascript'})
      var req_pth = req.url.slice(1, req.url.lastIndexOf('.'))
      var node = inst.resolve(req_pth)
      if (!node) { throw new Error("could not resolve accet "+req.url) }
      res.send(node.build())
    } else if (req.url.indexOf('/css/')===0) {
      res.set({'Content-Type': 'text/css'})
      var req_pth = req.url.slice(1, req.url.lastIndexOf('.'))
      var node = inst.resolve(req_pth)
      if (!node) { throw new Error("could not resolve accet "+req.url) }
      res.send(node.build())
    } else {
      next()
    }
  }
}
