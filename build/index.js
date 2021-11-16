const { copyDir, fileForEach, readFile, writeFile, unlinkDirFileByExtname, dirForEach } = require('@jiaminghi/fs')
const print = require('./plugin/print')
const path = require('path')
const exec = require('./plugin/exec')

const PACKAGE_SRC = './src'
const COMPILE_SRC = './lib'
const COMPONENTS_DIR = '/components'
const ENTRANCE = '/index.js'
const libName = 'datav'

async function start () {
  // Compile for NPM

  const copyPackage = await copyDir(PACKAGE_SRC, COMPILE_SRC)

  if (!copyPackage) {
    print.error('Exception in file copy!')

    return false
  }

  print.success('Complete file copy!')

  // 从vue 中提取less 并写入同名同目录下的less文件 ，同时删除vue文件中style相关的代码
  const abstract = await abstractLessFromVue()

  if (!abstract) {
    print.error('Exception in less file extraction!')

    return false
  }

  print.success('Complete less file extraction!')

  // 将提取出的less 编译到css 调用 lessc 将less文件写入同名的css 文件
  await compileLessToCss()

  print.success('Complete less compilation to css!')

  // 删除编译前的less 文件
  const unlink = await unlinkDirFileByExtname(COMPILE_SRC, ['.less'])

  if (!unlink) {
    print.error('Exception in less file deletion!')

    return false
  }

  print.success('Complete less file deletion!')

  // 将上步 编译好的css 进行导入 插入到index.js文件中
  const addImport = await addCssImport()

  if (!addImport) {
    print.error('Exception in adding css import statement!')

    return false
  }

  print.success('Finish adding css import statement!')

  // 收集components 中的组件  生成exports 字符串 插入到lib/index.js 中
  const componentsExport = await addComponentsExport()

  if (!componentsExport) {
    print.error('Exception in adding components export statement!')

    return false
  }

  print.success('Finish adding components export statement!')

  // Compile for UMD version 构建umd 的datav 包
  const rollupCompile = await exec(`rollup -c build/rollup.config.js`)

  if (!rollupCompile) {
    print.error('Exception in rollupCompile')

    return
  }

  print.tip('After rollupCompile')

  // 构建 压缩版本的 umd datav 包
  const terser = await exec(`rollup -c build/rollup.terser.config.js`)

  if (!terser) {
    print.error('Exception in terser')

    return
  }

  print.tip('After terser')

  print.yellow('-------------------------------------')
  print.success('     DataV Lib Compile Success!      ')
  print.yellow('-------------------------------------')

  return true
}

async function abstractLessFromVue () {
  let abstractSuccess = true

  await fileForEach(COMPILE_SRC, async src => {
    if (path.extname(src) !== '.vue') return

    let template = await readFile(src)

    let style = template.match(/<style[ \S\n\r]*/g)
    if (style) style = style[0]
    if (!style) return

    style = style.replace(/<style[ a-z="']*>(\n|\r)?|<\/style>/g, '')
    style = style.replace(/[\n\r]*$/, '')

    const styleSrc = src.replace('.vue', '.less')
    let write = await writeFile(styleSrc, style)

    if (!write) {
      print.error(styleSrc + ' write error!')

      abstractSuccess = false
    }

    template = template.replace(/<style[ \S\n\r]*/g, '')
    template = template.replace(/[\n\r]*$/, '')
    write = await writeFile(src, template)

    if (!write) {
      print.error(src + ' rewrite error!')

      abstractSuccess = false
    }
  })

  return abstractSuccess
}

async function compileLessToCss () {
  let compileSuccess = true

  await fileForEach(COMPILE_SRC, async src => {
    if (path.extname(src) !== '.less') return

    src = src.replace('./', '')

    const execString = `lessc ${src} ${src.replace('less', 'css')}`

    print.yellow(execString, {
      maxBuffer: 1024 ** 5
    })

    const compile = await exec(execString)

    if (!compile) {
      print.error(execString + ' Error!')

      compileSuccess = false
    }
  })

  return compileSuccess
}

async function addCssImport () {
  let importSuccess = true

  await fileForEach(COMPILE_SRC + COMPONENTS_DIR, async src => {
    if (path.extname(src) !== '.js') return

    let content = await readFile(src)

    if (content.search(/import[ \S]* from '[\S]*\.vue'/) === -1) return

    content = `import './src/main.css'\n` + content

    let write = await writeFile(src, content)

    if (!write) {
      print.error(src + ' write import error!')

      importSuccess = false
    }
  })

  return importSuccess
}

async function addComponentsExport () {
  const components = []

  await dirForEach(COMPILE_SRC + COMPONENTS_DIR, src => {
    components.push(src.split('/').slice(-1)[0])
  })

  const importString = components.reduce((all, current) => {
    return all + '\n' + `export { default as ${current} } from '.${COMPONENTS_DIR}/${current}/index'`
  }, '/**\n * EXPORT COMPONENTS\n */') + '\n'

  const targetSrc = COMPILE_SRC + ENTRANCE

  let content = await readFile(targetSrc)

  content = importString + content

  let write = await writeFile(targetSrc, content)

  return write
}

async function compileUMDVersion () {

}

start()
