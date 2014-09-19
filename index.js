var fs = require('fs')
var path = require('path')

var node_env = process.env.NODE_ENV || 'development';

/**
  export accets([path | obj]...) function
**/
module.exports = accets;
accets.Accets = Accets;
accets.AccetsError = AccetsError;

/**
  returns an Accets instance with each
    argument appended to root search paths
**/
function accets(arg0){
  if (!arg0) throw new AccetsError("accets(...) requires at least one path");
  var a = new Accets(arg0);
  [].slice.call(arguments, 1).forEach(function(arg){
    a.append(arg);
  });
  return a;
}

/**
  transform file types based on extension
**/
accets.transforms = {
  'css': {
    mimeType: 'text/css',
    matcher: /^\/\*(?:=?)(?:\s*)(require|require_tree)(?:\(|\s)(?:\s*)(?:(?:["']?)((?:\w|\/|-|\.)+)(?:["']?)(?:\)?)(?:\s*?))\*\/$/mg
  },
  'js': {
    mimeType: 'application/javascript',
    matcher: /^\/\/(?:=?)(?:\s*)(require|require_tree)(?:\(|\s)(?:\s*)(?:(?:["']?)((?:\w|\/|-|\.)+)(?:["']?)(?:\)?)(?:\s*?))$/mg
  }
};

/**
  dynamically build INCLUDE_MATCHER from accets.transforms
**/
Object.defineProperty(accets, "INCLUDE_MATCHER",{
  get: function(){
    return new RegExp(Object.keys(accets.transforms).map(function(ext){
      return "(?:"+accets.transforms[ext].matcher.source+")";
    }).join("|"), "mg");
  }
});

/**
  class Accets
**/
function Accets(arg, parent){
  this.parent = parent;
  if (this.parent && this.parent.relativeTo) {
    this.relativeTo = this.parent.relativeTo;
  }
  this.searchPaths = [arg];
  this._strippedAssets = {};
}

/**
  appends a new path or path-object
    to root search paths
**/
Accets.prototype.append = function(arg){
  this.searchPaths.push(arg);
};

/**
  async resolves child Accets by relative path
**/
Accets.prototype.resolve = function(rel){
  var i, sp, part, rem, result;
  if (0 === rel.indexOf("/")) rel = rel.substr(1);
  if (0 > rel.indexOf("/")) {
    part = rel;
  } else {
    part = rel.split("/")[0];
    rem = rel.substr(1+rel.indexOf("/"));
  }
  for (i = this.searchPaths.length-1; i >= 0; --i) {
    sp = this.searchPaths[i];
    if ("string"===typeof sp) {
      if (fs.existsSync(sp)) {
        if (fs.statSync(sp).isDirectory()){
          var spp;
          var d = fs.readdirSync(sp);
          for (var di in d){
            if ("."===d[di][0]) continue;
            if (d[di].indexOf(part)===0) {
              if (d[di].length>part.length && d[di][part.length]!=='.') {
                continue;
              }
              spp = path.join(sp, d[di]);
              break;
            }
          }
          if (spp) {
            result = new Accets(spp, this)
            break;
          }
        }
      }
    } else {
      if ("string"===typeof sp[part]) {
        result = new Accets(sp[part], this);
        break;
      } else if (sp[part]) {
        result = sp[part];
        break;
      }
    }
  }
  if (result) {
    if (rem) return result.resolve(rem);
    return result;
  } else {
    if (this.parent) return this.parent.resolve(rel);
  }
};

/**
  async creates an array of file paths
    sorted by require dependency order
**/
Accets.prototype.makeFileList = function(rel, cb){
  if ("string"===typeof rel) {
    return this.resolve(rel).makeFileList(cb);
  }
  if ("function"===typeof rel) {
    cb = rel;
  }
  return this.getFileListPairs()
           .map(function(a){return a.filepath});
};

/**
  returns objects of require paths and accet objects
**/
Accets.prototype.getFileListPairs = function(cb){

  // concat file lists of all search paths
  var fileList = [], sp;
  for (var i = 0; i < this.searchPaths.length; ++i) {
    sp = this.searchPaths[i];
    if ("string"===typeof sp) {
      if (fs.existsSync(sp)) {
        if (fs.statSync(sp).isDirectory()){
          // directory entry
          var d = fs.readdirSync(sp);
          for (var di in d){
            if ("."===d[di][0]) continue;
            fileList = fileList.concat(
              (new Accets(path.join(sp,d[di]), this)).getFileListPairs());
          }
        } else {
          // file entry
          var apnd = this.parseRequireList(sp);
          var spfp = this.formatFilepath(sp)
          // fileList = fileList.concat(apnd).concat([spfp]);
          fileList = fileList.concat(apnd)
                      .concat({filepath:spfp, instance:this});
        }
      } else {
        throw new AccetsError("could not resolve searchPath "+sp);
      }
    } else if (sp instanceof Accets) {
      // accets instance entry
      fileList = fileList.concat(sp.getFileListPairs())
    }
  };

  // dedup
  var uniqueFileList = [], uniqueFileSet = {};
  fileList.forEach(function(fle){
    if (!uniqueFileSet[fle.filepath]) {
      uniqueFileList.push(fle);
      uniqueFileSet[fle.filepath] = true;
    }
  });

  if (cb) return cb(null, uniqueFileList);
  return uniqueFileList;
};

/**
  async creates string of all asset resources
    processed by matching assetmaps
    sorted by require dependency order
**/
Accets.prototype.build = function(rel, cb){
  if ("string"===typeof rel) {
    return this.resolve(rel).build(cb);
  }
  if ("function"===typeof rel) {
    cb = rel;
  }
  var built = "";
  var targetext = null;
  var relativeTo = this.relativeTo;
  this.getFileListPairs().forEach(function(pair){
    for (var ext in accets.transforms) {
      if (ext===path.extname(pair.filepath).substr(1)) {
        break;
      }
    }
    var transform = accets.transforms[ext];
    if (!targetext) {
      targetext = (transform.becomes||ext);
    } else if (targetext!==(transform.becomes||ext)) {
      throw new AccetsError("cannot build accets of differing target extensions ",targetext,(transform.becomes||ext))
    }
    var fc = pair.instance._strippedAssets[pair.filepath];
    if (!fc) {
      var resolvedfilepath = pair.filepath;
      if (relativeTo) resolvedfilepath = path.join(relativeTo, pair.filepath);
      fc = fs.readFileSync(resolvedfilepath, {encoding:'utf8'});
      if (transform.matcher) fc = fc.replace(transform.matcher, '');
    }
    if (transform.compile) fc = transform.compile(pair.instance._strippedAssets[pair.filepath]);
    built += fc;
  });
  if (cb) return cb(null, built);
  return built;
};

/**
  returns connect/express compatible middleware
    opts.env=development: servers raw files
    otherwise servers results of Accets.build
**/
Accets.prototype.middleware = function(opts){
  var a = this;
  return function(req,res,next){
    var result, stream;
    if (req.url.length < 2) return next();
    result = a.resolve(req.url);
    if (!result) return next();
    if (opts.env==="development") {
      if ("string"!==typeof result) next();
      var ext = path.extname(req.url).substr(1);
      var transform = accets.transforms[ext];
      if (transform) {
        res.writeHead(200, transform.mimeType);
        stream = fs.createReadStream(result);
      }
    }
    stream.pipe(res);
  };
};

/**
  parses and resolves requires for file path
**/
Accets.prototype.parseRequireList = function(fp){
  var fileList = [], ln, cc = 0;
  var contents = fs.readFileSync(fp, {encoding:"utf8"});
  var lines = contents.split("\n");
  lineloop: for (ln = 0; ln < lines.length; ++ln) {
    var line = lines[ln];
    for (var ext in accets.transforms) {
      var m = accets.transforms[ext].matcher.exec(line)
      accets.transforms[ext].matcher.lastIndex = 0;
      if (m) {
        var suba = this.resolve(m[2]);
        if (!suba) {
          var e = new AccetsError('require "'+m[2]+'" not found');
          e.setRequireStack(fp, ln);
          throw e;
        }
        fileList = fileList.concat(suba.getFileListPairs());
        cc += 1+line.length;
        continue lineloop;
      }
    }
    break;
  }
  this._strippedAssets[fp] = (new Array(ln+1)).join("\n")+contents.slice(cc);
  return fileList;
};

/**
  parses and resolves requires for file path
**/
Accets.prototype.formatFilepath = function(fp){
  if (this.relativeTo && fp.indexOf(this.relativeTo)===0) {
    return fp.substr(this.relativeTo.length);
  }
  return fp;
};

/**
  an error caused by require or usage issues
**/
AccetsError.prototype = Object.create(Error.prototype);
function AccetsError(message, inner){
  var tmp = Error.call(this, message);
  tmp.name = this.name = 'AccetsError';
  this.message = tmp.message;
  this.inner = inner;
  var trimIdx = tmp.stack.indexOf("\n",
                  1+tmp.stack.indexOf("\n",
                    1+tmp.stack.indexOf("\n")));
  this.stack = this.name+": "+this.message+
                tmp.stack.substr(trimIdx);
  return this;
}
AccetsError.prototype.setRequireStack = function(fp, ln){
  this.stack = this.name+": "+this.message+
                '\n    at '+fp+':'+(1+ln);
};

var _fileCache = {};
function _checkParsedFileCache(fp, opts){
  try {
    if (_fileCache[fp] && fs.statSync(fp).mtime===_fileCache[fp].t) {
      return _fileCache[fp].f;
    }
  } catch (e) {}
  return null;
}
function _insertParsedFileCache(fp, contents){
  _fileCache[fp] = {
    t: fs.statSync(fp).mtime,
    f: contents
  };
}
