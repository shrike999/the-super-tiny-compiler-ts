type nodeType = 'StringLiteral' | 'NumberLiteral' | 'CallExpression' | 'Program'
type parsedNodeType = nodeType | 'Identifier' | 'ExpressionStatement'
type tokenType = 'name' | 'paren' | 'number' | 'string'
interface token {
  type: tokenType
  value: string
}

interface node {
  type: nodeType
  params?: node[]
  value?: string
  name?: string
  body?: node[]
}

interface parsedNode {
  type: parsedNodeType
  value?: string
  name?: string
  expression?: parsedNode
  arguments?: parsedNode[]
  body?: parsedNode[]
  callee?: {
    type: 'Identifier',
    name: string
  }
}

//用interface会报错
type visitor = {
  [K in nodeType]?: {
    enter?: (node: node, parent: node | null) => void,
    exit?: (node: node, parent: node | null) => void,
  }
}

function tokenizer(input: string): Array<token> {
  const tokens: Array<token> = []
  let current = 0
  const letterReg = /[a-z]/i
  const numberReg = /[0-9]/
  const parenReg = /[()]/
  const whiteSpaceReg = /\s/
  while (current < input.length) {
    let char = input[current]
    switch (true) {
      case numberReg.test(char):
        let numberValue = ''
        //收集数字字符，拼成参数
        while (numberReg.test(char)) {
          numberValue += input[current]
          char = input[++current]
        }
        tokens.push({ type: 'number', value: numberValue })
        break;
      case letterReg.test(char):
        let letterValue = ''
        //收集字母字符，拼成函数名
        while (letterReg.test(char)) {
          letterValue += input[current]
          char = input[++current]
        }
        tokens.push({ type: 'name', value: letterValue })
        break;
      case (parenReg.test(char)):
        tokens.push({ type: 'paren', value: input[current] })
        current++
        break;
      case (whiteSpaceReg.test(char)):
        current++
        break;
      //处理字符串参数
      case char === '"':
        let stringValue = ''
        char = input[++current]
        while (char !== '"') {
          stringValue += char
          char = input[++current]
        }
        current++
        tokens.push({ type: 'string', value: stringValue })
        break;
      default:
        console.log('I do not understand this character:', char)
        break;
    }
  }
  return tokens
}

function parser(tokens: token[]): node {
  //通过闭包共享指针current
  let current = 0
  let token = tokens[current]
  function walk(): node {
    switch (token.type) {
      case 'number':
        current++
        return { type: 'NumberLiteral', value: token.value }
      case 'string':
        current++
        return { type: 'StringLiteral', value: token.value }
      case 'paren':
        if (token.value === '(') {
          //to skip open parenthesis
          token = tokens[++current]
          const curNode: node = { type: 'CallExpression', name: token.value, params: [] }
          //to skip name token
          token = tokens[++current]

          while (
            (token.type !== 'paren') ||
            (token.type === 'paren' && token.value !== ')')
          ) {
            curNode.params?.push(walk())
            //collect params of current function call
            token = tokens[current]
          }
          //to skip the closing parenthesis
          current++

          return curNode
        }
      default:
        throw new TypeError(token.type);
    }
  }


  const ast: node = {
    type: 'Program',
    body: []
  }

  //为什么在循环中调用？因为可能存在 * 不嵌套 * 的数个函数调用
  //如 (add 2 3)(sub 4 3)
  while (current < tokens.length) {
    ast.body?.push(walk())
  }

  return ast
}

function traverser(ast: node, visitor: visitor) {
  function traverseArray(nodeArray: node[], parent: node) {
    nodeArray.forEach(node => {
      traverseNode(node, parent)
    })
  }
  function traverseNode(node: node, parent: node | null) {
    const methods = visitor[node.type]
    if (methods?.enter) {
      methods?.enter(node, parent)
    }

    switch (node.type) {
      case 'NumberLiteral':
      case 'StringLiteral':
        break;

      case 'Program':
        //其实不用加if，但是不加会静态报错
        if (node.body)
          traverseArray(node.body, node)
        break;

      case 'CallExpression':
        if (node.params)
          traverseArray(node.params, node)
        break;

      default:
        throw new TypeError(node.type);
    }

    if (methods?.exit) {
      methods.exit(node, parent)
    }
  }
  //没有父节点
  traverseNode(ast, null)
}

function transformer(ast: node): parsedNode {
  const newAst = {
    type: 'Program' as parsedNodeType,
    body: []
  }
  ast['_context'] = newAst.body

  const visitor: visitor = {
    'NumberLiteral': {
      enter: (node, parent) => {
        //其实不需要if，理由同上
        if (parent)
          parent['_context'].push(node)
      }
    },
    'StringLiteral': {
      enter: (node, parent) => {
        //其实不需要if，理由同上
        if (parent)
          parent['_context'].push(node)
      }
    },
    'CallExpression': {
      enter: (node, parent) => {
        let expression: any = {
          type: 'CallExpression',
          callee: {
            type: 'Identifier',
            name: node.name
          },
          arguments: []
        }
        //创建_context以供子节点被push
        node['_context'] = expression.arguments

        if (parent) {
          if (parent.type !== 'CallExpression') {
            expression = {
              type: 'ExpressionStatement',
              expression
            }
          }
          parent['_context'].push(expression)
        }
      }
    }
  }
  traverser(ast, visitor)
  return newAst
}

function codeGenerator(node: parsedNode) {
  switch (node.type) {
    case 'Program':
      return node.body?.map(codeGenerator)
    case 'ExpressionStatement':
      if (node.expression)
        return codeGenerator(node.expression) + ';'
    case 'CallExpression':
      if (node.callee)
        return codeGenerator(node.callee) + '(' + node.arguments?.map(codeGenerator).join(',') + ')'
    case 'Identifier':
      return node.name
    case 'NumberLiteral':
      return node.value
    case 'StringLiteral':
      return '"' + node.value + '"'
    default:
      throw new TypeError(node.type);
  }
}

function compiler(input: string) {
  const tokens = tokenizer(input)
  const ast = parser(tokens)
  const newAst = transformer(ast)
  console.log(newAst);

  const generatedCodes = codeGenerator(newAst)
  return generatedCodes
}

module.exports = {
  tokenizer,
  parser,
  traverser,
  transformer,
  codeGenerator,
  compiler,
};

