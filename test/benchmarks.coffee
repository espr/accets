path = require 'path'

Accets =
  old: try require '../old'
  new: require '../index'

FIXTURES_PATH = path.resolve __dirname, './fixtures/'
LONG_DEP_PATH = path.resolve __dirname, './fixtures/long_dep.js'

bench = (count, fn)->
  benchvariant = (variant)->
    st = Date.now()
    fn(variant) for i in [2..count]
    rt = Date.now()-st
    console.log("    #{if Accets.old then variant else ''} #{count} tests in #{rt/1000.0}s"+
                " (average: #{rt/(count*1000.0)}s)")
    return rt
  console.log("")
  if Accets.old?
    console.log("      improvement: #{(((benchvariant('old')/benchvariant('new'))*100.0)-100).toFixed(1)}%")
  else
    benchvariant('new')

describe 'accets benchmarks', ->

  it 'build dep tree', ->
    bench 2000, (v)-> Accets[v](FIXTURES_PATH).build("dep_tree")

  it 'long dependency test', ->
    bench 200, (v)-> Accets[v](LONG_DEP_PATH).build()
