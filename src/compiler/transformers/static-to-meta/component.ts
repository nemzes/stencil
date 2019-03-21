import * as d from '../../../declarations';
import { parseStaticMethods } from './methods';
import { parseStaticListeners } from './listeners';
import { setComponentBuildConditionals } from '../component-build-conditionals';
import { parseClassMethods } from './class-methods';
import { parseStaticElementRef } from './element-ref';
import { parseStaticEncapsulation } from './encapsulation';
import { parseStaticEvents } from './events';
import { convertValueToLiteral, createStaticGetter, getComponentTagName, getStaticValue, isInternal, isStaticGetter, serializeSymbol } from '../transform-utils';
import { parseStaticProps } from './props';
import { parseStaticStates } from './states';
import { parseStaticWatchers } from './watchers';
import { parseStaticStyles } from './styles';
import { parseCallExpression } from './call-expression';
import { parseStringLiteral } from './string-literal';
import ts from 'typescript';
import { normalizePath } from '@utils';


export function parseStaticComponentMeta(config: d.Config, transformCtx: ts.TransformationContext, typeChecker: ts.TypeChecker, cmpNode: ts.ClassDeclaration, moduleFile: d.Module, nodeMap: d.NodeMap, transformOpts: d.TransformOptions) {
  if (cmpNode.members == null) {
    return cmpNode;
  }
  const staticMembers = cmpNode.members.filter(isStaticGetter);
  const tagName = getComponentTagName(staticMembers);
  if (tagName == null) {
    return cmpNode;
  }

  const regex = new RegExp(/^[a-z](?:[\-\.0-9_a-z\xB7\xC0-\xD6\xD8-\xF6\xF8-\u037D\u037F-\u1FFF\u200C\u200D\u203F\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])*-(?:[\-\.0-9_a-z\xB7\xC0-\xD6\xD8-\xF6\xF8-\u037D\u037F-\u1FFF\u200C\u200D\u203F\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])*$/);
  if (!regex.test(tagName)) {
    throw new SyntaxError(`"${tagName}" is not a valid tag name. Please refer to
    https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name for more info.`);
  }

  const symbol = typeChecker.getSymbolAtLocation(cmpNode.name);
  const docs = serializeSymbol(typeChecker, symbol);
  const cmp: d.ComponentCompilerMeta = {
    isLegacy: false,
    tagName: tagName,
    excludeFromCollection: moduleFile.excludeFromCollection,
    isCollectionDependency: moduleFile.isCollectionDependency,
    componentClassName: (cmpNode.name ? cmpNode.name.text : ''),
    elementRef: parseStaticElementRef(staticMembers),
    encapsulation: parseStaticEncapsulation(staticMembers),
    properties: parseStaticProps(staticMembers),
    virtualProperties: parseVirtualProps(docs),
    states: parseStaticStates(staticMembers),
    methods: parseStaticMethods(staticMembers),
    listeners: parseStaticListeners(staticMembers),
    events: parseStaticEvents(staticMembers),
    watchers: parseStaticWatchers(staticMembers),
    styles: parseStaticStyles(config, tagName, moduleFile.sourceFilePath, staticMembers),
    legacyConnect: getStaticValue(staticMembers, 'connectProps'),
    legacyContext: getStaticValue(staticMembers, 'contextProps'),
    internal: isInternal(docs),
    assetsDirs: parseAssetsDirs(config, staticMembers, moduleFile.jsFilePath),
    styleDocs: [],
    dependencies: [],
    docs,
    jsFilePath: moduleFile.jsFilePath,
    sourceFilePath: moduleFile.sourceFilePath,

    hasAttributeChangedCallbackFn: false,
    hasComponentWillLoadFn: false,
    hasComponentDidLoadFn: false,
    hasComponentWillUpdateFn: false,
    hasComponentDidUpdateFn: false,
    hasComponentWillRenderFn: false,
    hasComponentDidRenderFn: false,
    hasComponentDidUnloadFn: false,
    hasConnectedCallbackFn: false,
    hasDisonnectedCallbackFn: false,
    hasElement: false,
    hasEvent: false,
    hasLifecycle: false,
    hasListener: false,
    hasListenerTarget: false,
    hasListenerTargetWindow: false,
    hasListenerTargetDocument: false,
    hasListenerTargetBody: false,
    hasListenerTargetParent: false,
    hasMember: false,
    hasMethod: false,
    hasMode: false,
    hasAttribute: false,
    hasProp: false,
    hasPropMutable: false,
    hasReflect: false,
    hasRenderFn: false,
    hasState: false,
    hasStyle: false,
    hasVdomAttribute: true,
    hasVdomClass: true,
    hasVdomFunctional: true,
    hasVdomKey: true,
    hasVdomListener: true,
    hasVdomRef: true,
    hasVdomRender: false,
    hasVdomStyle: true,
    hasVdomText: true,
    hasWatchCallback: false,
    isPlain: false,
    htmlAttrNames: [],
    htmlTagNames: [],
    isUpdateable: false,
    potentialCmpRefs: []
  };

  function visitComponentChildNode(node: ts.Node): ts.VisitResult<ts.Node> {
    if (ts.isCallExpression(node)) {
      parseCallExpression(cmp, node);
    } else if (ts.isStringLiteral(node)) {
      parseStringLiteral(cmp, node);
    }
    return ts.visitEachChild(node, visitComponentChildNode, transformCtx);
  }
  ts.visitEachChild(cmpNode, visitComponentChildNode, transformCtx);

  parseClassMethods(cmpNode, cmp);
  setComponentBuildConditionals(cmp);

  if (transformOpts.addCompilerMeta) {
    // no need to copy all compiler meta data to the static getter
    const copyCmp = Object.assign({}, cmp);
    delete copyCmp.assetsDirs;
    delete copyCmp.dependencies;
    delete copyCmp.excludeFromCollection;
    delete copyCmp.isCollectionDependency;
    delete copyCmp.docs;
    delete copyCmp.jsFilePath;
    delete copyCmp.potentialCmpRefs;
    delete copyCmp.styleDocs;
    delete copyCmp.sourceFilePath;

    const cmpMetaStaticProp = createStaticGetter('COMPILER_META', convertValueToLiteral(copyCmp));
    const classMembers = [...cmpNode.members, cmpMetaStaticProp];

    cmpNode = ts.updateClassDeclaration(
      cmpNode,
      cmpNode.decorators,
      cmpNode.modifiers,
      cmpNode.name,
      cmpNode.typeParameters,
      cmpNode.heritageClauses,
      classMembers
    );
  }

  // add to module map
  moduleFile.cmps.push(cmp);

  // add to node map
  nodeMap.set(cmpNode, cmp);

  return cmpNode;
}

function parseVirtualProps(docs: d.CompilerJsDoc) {
  return docs.tags
    .filter(({name}) => name === 'virtualProp')
    .map(parseVirtualProp)
    .filter(prop => !!prop);
}

function parseVirtualProp(tag: d.CompilerJsDocTagInfo): d.ComponentCompilerVirtualProperty {
  const results = /^\s*(?:\{([^}]+)\}\s+)?(\w+)\s+-\s+(.*)$/.exec(tag.text);
  if (!results) {
    return undefined;
  }
  const [, type, name, docs] = results;
  return {
    type: type == null ? 'any' : type.trim(),
    name: name.trim(),
    docs: docs.trim()
  };
}

function parseAssetsDirs(config: d.Config, staticMembers: ts.ClassElement[], componentFilePath: string): d.AssetsMeta[] {
  const dirs: string[] = getStaticValue(staticMembers, 'assetsDirs') || [];
  const componentDir = normalizePath(config.sys.path.dirname(componentFilePath));

  return dirs.map(dir => {
    // get the relative path from the component file to the assets directory
    dir = normalizePath(dir.trim());

    let absolutePath = dir;
    let cmpRelativePath = dir;
    if (config.sys.path.isAbsolute(dir)) {
      // if this is an absolute path already, let's convert it to be relative
      cmpRelativePath = config.sys.path.relative(componentDir, dir);
    } else {
      // create the absolute path to the asset dir
      absolutePath = config.sys.path.join(componentDir, dir);
    }
    return {
      absolutePath,
      cmpRelativePath,
      originalComponentPath: dir,
    };
  });
}
