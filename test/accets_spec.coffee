fs = require 'fs'
path = require 'path'
CoffeeScript = require 'coffee-script'

Accets = require '../index'

makepath = (s)->path.resolve(__dirname, path.join('./fixtures/',s))
SIMPLE_PATH           = makepath 'simple.js'
OTHER_PATH            = makepath 'other.js'
DEPENDER_PATH         = makepath 'depender.js'
DEP_ON_MOD_PATH       = makepath 'dep_on_mod.js'
MODULE_PATH           = makepath 'dir'
SUBFILE_PATH          = makepath 'dir/subfile.js'
DEP_ON_SUB_MOD_PATH   = makepath 'dep_on_sub_mod.js'
SUPERDEEPFILE_PATH    = makepath 'dir/subdir/superdeep.js'
OREIMO_PATH           = makepath 'dir/oreimo.js'
COFFEE_EXAMPLE_PATH   = makepath 'coffee.coffee'
COFFEE_COMPILED_PATH  = makepath 'coffee.js'
COMMON_PATH           = makepath 'common'
COMMON_EXAMPLE_PATH   = makepath 'common_example.js'
BAD_DEP_PATH          = makepath 'bad_dep.js'

read_files = ()->
  (for a in arguments
    fs.readFileSync(a, encoding: 'utf8').replace(Accets.INCLUDE_MATCHER, '')
  ).join('')

describe 'accets', ->

  it 'should be a function', ->
    assert.isFunction(Accets)

  it 'should be able to create a string of output from a given path', (done)->
    Accets(SIMPLE_PATH).build (err, actual)->
      throw err if err?
      assert.equal(actual, read_files(SIMPLE_PATH))
      done()

  it 'should concatenate two independent assets', (done)->
    Accets(SIMPLE_PATH, OTHER_PATH).build (err, actual)->
      throw err if err?
      assert.equal(actual, read_files(SIMPLE_PATH, OTHER_PATH))
      done()

  it 'should resolve dependency provided in map parameter', (done)->
    Accets(DEPENDER_PATH, simple: OTHER_PATH).build (err, actual)->
      throw err if err?
      assert.equal(actual, read_files(OTHER_PATH, DEPENDER_PATH))
      done()

  it 'should resolve dependencies local to each composed asset', (done)->
    subccet = Accets(DEPENDER_PATH, simple: OTHER_PATH)
    Accets(subccet, SIMPLE_PATH, simple: SIMPLE_PATH).build (err, actual)->
      throw err if err?
      assert.equal(actual, read_files(OTHER_PATH, DEPENDER_PATH, SIMPLE_PATH))
      done()

  it 'should resolve dependencies local to each composed asset', (done)->
    subccet = Accets(DEPENDER_PATH, simple: OTHER_PATH)
    Accets(subccet, SIMPLE_PATH, simple: SIMPLE_PATH).build (err, actual)->
      throw err if err?
      assert.equal(actual, read_files(OTHER_PATH, DEPENDER_PATH, SIMPLE_PATH))
      done()

  it 'should resolve composed asset dependency', (done)->
    subccet = Accets(SIMPLE_PATH)
    Accets(simple: subccet, DEPENDER_PATH).build (err, actual)->
      throw err if err?
      assert.equal(actual, read_files(SIMPLE_PATH, DEPENDER_PATH))
      done()

  it 'should compose assets by given directory', (done)->
    subccet = Accets(MODULE_PATH)
    Accets(dir: subccet, DEP_ON_MOD_PATH).build (err, actual)->
      throw err if err?
      assert.equal(actual, read_files(SUBFILE_PATH, DEP_ON_MOD_PATH))
      done()

  it 'should resolve asset provided in subdirectory of given module', (done)->
    subccet = Accets(MODULE_PATH)
    Accets(dir: subccet, DEP_ON_SUB_MOD_PATH).build (err, actual)->
      throw err if err?
      assert.equal(actual, read_files(SUPERDEEPFILE_PATH, DEP_ON_SUB_MOD_PATH))
      done()

  it 'should resolve asset with siblings dependency', (done)->
    Accets(MODULE_PATH).resolve('oreimo').build (err, actual)->
      throw err if err?
      assert.equal(actual, read_files(SUBFILE_PATH, SUPERDEEPFILE_PATH, OREIMO_PATH))
      done()

  it 'should support custom transformers', (done)->
    Accets.transforms['coffee'] = {
      becomes: 'js',
      matcher: /^#(?:=?)(?:\s*)(require|require_tree)(?:\(|\s)(?:\s*)(?:(?:["']?)((?:\w|\/|-|\.)+)(?:["']?)(?:\)?)(?:\s*?))$/mg,
      compile: CoffeeScript.compile
    }
    Accets(simple: SIMPLE_PATH, COFFEE_EXAMPLE_PATH).build (err, actual)->
      throw err if err?
      assert.equal(actual, read_files(SIMPLE_PATH, COFFEE_COMPILED_PATH))
      done()

  it 'should include newly added files on subsequent calls', ()->
    accets = Accets(MODULE_PATH)

    # expect original build
    originalExpected = read_files(
      MODULE_PATH+"/subfile.js",
      MODULE_PATH+"/subdir/superdeep.js",
      MODULE_PATH+"/oreimo.js"
    )
    actual = accets.resolve('oreimo').build()
    assert.equal(actual, originalExpected)

    # expect changed list with new file added
    newFilePath = MODULE_PATH+"/subdir/new_superdeep.js"
    fs.unlinkSync(newFilePath) if fs.existsSync(newFilePath)
    fs.writeFileSync(newFilePath,
      "console.log('this is new_superdeep.js')",
      {encoding:'utf8'})
    newActual = accets.resolve('oreimo').build()
    newExpected = read_files(
      MODULE_PATH+"/subfile.js",
      newFilePath,
      MODULE_PATH+"/subdir/superdeep.js",
      MODULE_PATH+"/oreimo.js"
    )
    fs.unlinkSync(newFilePath)
    assert.equal(newActual, newExpected)
    # expect original build with new file removed
    actual = accets.resolve('oreimo').build()
    assert.equal(actual, originalExpected)
