fs = require 'fs'
path = require 'path'
Accets = require '../index'

FIXTURES_PATH = path.resolve __dirname, './fixtures/'

EXPECTED_FILE_LIST = [
  FIXTURES_PATH+"/dir/subfile.js",
  FIXTURES_PATH+"/dir/subdir/superdeep.js",
  FIXTURES_PATH+"/dir/oreimo.js",
  FIXTURES_PATH+"/dep_tree.js"
]

describe 'accets#makeFileList', ->

  it 'should be a function', ->
    accets = Accets(FIXTURES_PATH)
    assert.isFunction(accets.makeFileList)

  it 'should collect and order required dependencies', ->
    fileList = Accets(FIXTURES_PATH).makeFileList 'dep_tree'
    assert.deepEqual(fileList, EXPECTED_FILE_LIST)

  it 'should trim paths if path starts with relativeTo option', ->
    accets = Accets(FIXTURES_PATH)
    accets.relativeTo = FIXTURES_PATH
    EXPECTED_RELATIVE_LIST = for fp in EXPECTED_FILE_LIST
      fp.replace FIXTURES_PATH, ""
    fileList = accets.makeFileList 'dep_tree'
    assert.deepEqual(fileList, EXPECTED_RELATIVE_LIST)

  it 'should include newly added files on subsequent calls', ->
    accets = Accets(FIXTURES_PATH)

    # expect original list
    fileList = accets.makeFileList 'dep_tree'
    assert.deepEqual(fileList, EXPECTED_FILE_LIST)

    # expect changed list with new file added
    newFilePath = FIXTURES_PATH+"/dir/subdir/new_superdeep.js"
    fs.writeFileSync(newFilePath,
      "console.log('this is new_superdeep.js')",
      {encoding:'utf8'})
    newFileList = accets.makeFileList 'dep_tree'
    newExpectedList = [EXPECTED_FILE_LIST[0], newFilePath]
                        .concat(EXPECTED_FILE_LIST[1..])
    fs.unlinkSync(newFilePath)
    assert.deepEqual(newFileList, newExpectedList)

    # expect original list with new file removed
    fileList = accets.makeFileList 'dep_tree'
    assert.deepEqual(fileList, EXPECTED_FILE_LIST)
