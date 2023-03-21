---
title: 用typescript写一个迷你编译器
date: '2023-03-20'
tag: Tutorial
---

可以算是对 https://github.com/jamiebuilds/the-super-tiny-compiler 的学习笔记，但原文是用js写的<br>

## 目标：将lisp-like语言编译成c-like

```
              LISP                      C
 *
 *   2 + 2          (add 2 2)                 add(2, 2)
 *   4 - 2          (subtract 4 2)            subtract(4, 2)
 *   2 + (4 - 2)    (add 2 (subtract 4 2))    add(2, subtract(4, 2))
```

## 概念阐述：

大多数编译器都可以被拆解为3个阶段：
1. 解析(parsing)：即将源代码转换为抽象表示
2. 转换(transformation)：将这个抽象表示转为目标结构
3. 生成代码(code generation)：依据转换后的结构，生成新代码

### 解析(parsing)
```lisp
(add 2 (subtract 4 2))
```
解析阶段可以分为：
1. 词法分析(lexical analysis): 将源码拆分为token

```javascript
 [
   { type: 'paren',  value: '('        },
   { type: 'name',   value: 'add'      },
   { type: 'number', value: '2'        },
   { type: 'paren',  value: '('        },
   { type: 'name',   value: 'subtract' },
   { type: 'number', value: '4'        },
   { type: 'number', value: '2'        },
   { type: 'paren',  value: ')'        },
   { type: 'paren',  value: ')'        },
 ]
```

2. 语法分析(syntactic analysis)：将token组合成AST

>抽象语法树(Abstract Syntax Tree)是一个深度嵌套的对象，描述了不同语法间的关系
>AST上的每个节点都是一个带有<code>type</code>属性的对象
```javascript
{
 type: 'Program',
 body: [{
   type: 'CallExpression',
   name: 'add',
   params: [{
     type: 'NumberLiteral',
     value: '2',
   }, {
     type: 'CallExpression',
     name: 'subtract',
     params: [{
       type: 'NumberLiteral',
       value: '4',
     }, {
       type: 'NumberLiteral',
       value: '2',
     }]
   }]
 }]
}
```

### 转换(transformation)
编译器的下一步工作是transformation，可以保持语言类型，或是转换为其他语言。在转换过程中，我们可以对AST中的节点进行CRUD，或者创建一棵新的AST<br>
因为我们要将代码转换为一门新的语言，因此需要创建一棵新树。在这里原作者用了一种很“简陋”但巧妙的做法，后文会详述

#### 遍历
为了访问到AST上的所有节点，我们会对其进行DFS

#### Visitors
visitor是一个作为参数传给遍历函数的配置对象。其中key是不同的节点种类，value则是想要对特定种类节点执行的操作<br>
可以在进/出节点时定义不同的操作。

```javascript
// 示例
const visitor = {
  NumberLiteral() {},
  CallExpression() {},
};
```

### 生成代码
最后一步。即把新的AST转换为字符串


## 实操
```lisp
(add 2 (subtract 4 2))
```

过程：收集token，创建下面左边的AST，再依此创建右边的AST，并最终通过它生成C-like代码
```
 * ----------------------------------------------------------------------------
 *   Original AST                     |   Transformed AST
 * ----------------------------------------------------------------------------
 *   {                                |   {
 *     type: 'Program',               |     type: 'Program',
 *     body: [{                       |     body: [{
 *       type: 'CallExpression',      |       type: 'ExpressionStatement',
 *       name: 'add',                 |       expression: {
 *       params: [{                   |         type: 'CallExpression',
 *         type: 'NumberLiteral',     |         callee: {
 *         value: '2'                 |           type: 'Identifier',
 *       }, {                         |           name: 'add'
 *         type: 'CallExpression',    |         },
 *         name: 'subtract',          |         arguments: [{
 *         params: [{                 |           type: 'NumberLiteral',
 *           type: 'NumberLiteral',   |           value: '2'
 *           value: '4'               |         }, {
 *         }, {                       |           type: 'CallExpression',
 *           type: 'NumberLiteral',   |           callee: {
 *           value: '2'               |             type: 'Identifier',
 *         }]                         |             name: 'subtract'
 *       }]                           |           },
 *     }]                             |           arguments: [{
 *   }                                |             type: 'NumberLiteral',
 *                                    |             value: '4'
 * ---------------------------------- |           }, {
 *                                    |             type: 'NumberLiteral',
 *                                    |             value: '2'
 *                                    |           }]
 *  (sorry the other one is longer.)  |         }
 *                                    |       }
 *                                    |     }]
 *                                    |   }
 * ----------------------------------------------------------------------------

```

### 创建tokenizer函数
首先，明确一个token对象的结构：
```typescript
type tokenType = 'name' | 'paren' | 'number' | 'string'
interface token {
  type: tokenType
  value: string
}
```

思路：遍历代码字符串，识别出函数名、括号、不同类的参数，并通过switch case（原作者用的是if）收集为不同的token，最终返回一个token数组

```typescript
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
```

### 解析并生成AST
首先，明确原AST的节点接口
```typescript
type nodeType = 'StringLiteral' | 'NumberLiteral' | 'CallExpression' | 'Program'
interface node {
  type: nodeType
  params?: node[]
  value?: string | undefined;
  name?: string | undefined;
  body?: node[]
}
```
```typescript
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
```

### 遍历

visitor格式：
```typescript
type visitor = {
  [K in nodeType]?: {
    //可以在进入/离开节点时分别进行操作
    enter?: (node: node, parent: node | null) => void,
    exit?: (node: node, parent: node | null) => void,
  }
}
```
遍历函数就是一个简单的DFS
```typescript
function traverser(ast: node, visitor: visitor) {
  function traverseArray(nodeArray: node[], parent: node) {
    nodeArray.forEach(node => {
      traverseNode(node, parent)
    })
  }
  function traverseNode(node: node, parent: node | null) {
    const methods = visitor[node.type]
    methods?.enter?.(node, parent)

    switch (node.type) {
      case 'NumberLiteral':
      case 'StringLiteral':
        break;

      case 'Program':
        node.body && traverseArray(node.body, node)
        break;

      case 'CallExpression':
        node.params && traverseArray(node.params, node)
        break;

      default:
        throw new TypeError(node.type);
    }

    methods?.exit?.(node, parent)
  }
  //没有父节点
  traverseNode(ast, null)
}
```
然后依据我们的需求——生成一棵新的AST，来编写visitor。这里就用到了前文提到的巧妙方法：<br>
再遍历过程中，如果遇到了*调用表达式*节点，就在它上面新创建一个<code>_context</code>属性，并把新AST对应节点的<code>arguments</code>数组赋值给它。
随后遍历到*调用表达式*的参数节点时，就把该节点push到<code>_context</code>数组中<br>
由于数组是引用类型，所以新节点中的<code>arguments</code>此时也同步更新
```typescript
const visitor: visitor = {
  'NumberLiteral': {
    enter: (node, parent) => {
      parent && parent['_context'].push(node)
    }
  },
  'StringLiteral': {
    enter: (node, parent) => {
      parent && parent['_context'].push(node)
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
      //创建_context记录新AST对应CallExpression节点的argumants
      node['_context'] = expression.arguments
      //给最外层调用再添加一个*表达式声明*节点
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
```
新AST中还要在最外层添加一个Program节点。于是最终打包成这个函数：
```typescript
interface parsedNode {
  type: parsedNodeType
  value?: string | undefined;
  name?: string | undefined;
  expression?: parsedNode
  arguments?: parsedNode[]
  body?: parsedNode[]
  callee?: {
    type: 'Identifier',
    name: string
  }
}
function transformer(ast: node): parsedNode {
  const newAst = {
    type: 'Program' as parsedNodeType,
    body: []
  }
  ast['_context'] = newAst.body
  traverser(ast, visitor)
  return newAst
}
```

### 生成代码
递归地生成代码
```typescript
function codeGenerator(node: parsedNode) {
  switch (node.type) {
    case 'Program':
      return node.body?.map(codeGenerator)
    case 'ExpressionStatement':
      return node.expression && codeGenerator(node.expression) + ';'
    case 'CallExpression':
      return node.callee && codeGenerator(node.callee) + '(' + node.arguments?.map(codeGenerator).join(',') + ')'
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
```
导出
```typescript
export function compiler(input: string) {
  const tokens = tokenizer(input)
  const ast = parser(tokens)
  const newAst = transformer(ast)
  const generatedCodes = codeGenerator(newAst)
  return generatedCodes
}
```




