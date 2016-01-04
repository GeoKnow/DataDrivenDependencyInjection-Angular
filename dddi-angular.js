(function() {

'use strict';


var DiUtils = {
    /** 
     * Function that wraps an array-returning function, such that
     * the returned array will always have the same reference
     */
    wrapArrayFn: function(sourcArrayFn, equalsFn) {
        var targetArray = [];

        equalsFn = equalsFn || angular.equals;

        var result = function() {
            var sourceArray = sourcArrayFn.apply(this, arguments);
            var l = sourceArray ? sourceArray.length : 0;
            DiUtils.resizeArray(targetArray, l);

            for(var i = 0; i < l; ++i) {
                var s = sourceArray[i];
                var t = targetArray[i];

                var isEqual = equalsFn(s, t);
                if(!isEqual) {
                    targetArray[i] = s;
                }
            }
            return targetArray;
        };

        return result;
    },


    resizeArray: function(arr, targetLength, handlers) {
        handlers = handlers || {};

        var k = arr.length;

        var i;
        while(arr.length < targetLength) {
            i = arr.length;
            var init = handlers.preCreate ? handlers.preCreate(i, null, arr) : null;
            arr.push(init);
            handlers.postCreate && handlers.postCreate(i, init, arr);
        }

        while(arr.length > targetLength) {
            i = arr.length - 1;
            var item = arr[i];
            handlers.preDestroy && handlers.preDestroy(i, item, arr);
            arr.pop();
            handlers.postDestroy && handlers.postDestroy(i, item, arr);
        }
    },


    /**
     * Takes a model function and binds it to the context returned by a contextFn.
     * Returns a new function whose invocation returns the value in regard to the current context.
     * If the model has a .assign method, it will be wrapped as well to execute against the context.
     */
    bindExpr: function(expr, contextOrFn) {
        var result = angular.isFunction(contextOrFn)
            ? this.bindExprFn(expr, contextOrFn)
            : this.bindExprData(expr, contextOrFn)
            ;

        return result;
    },

    bindExprData: function(expr, context) {
        var r = function() {
            var r = expr(context);
            return r;
        };

        if(expr.assign) {
            r.assign = function(value) {
                expr.assign(context, value);
            };
        }

        return r;
    },

    bindExprFn: function(expr, contextFn) {

        var r = function() {
            var context = contextFn();
            var r = expr(context);
            return r;
        };

        if(expr.assign) {
            r.assign = function(value) {
                var context = contextFn();
                expr.assign(context, value);
            };
        }

        return r;
    },

    /**
     * Binds a provider to a given context
     */
    bindProvider: function(provider, contextFn) {
        var result = {
            fn: provider.fn,
            deps: provider.deps.map(function(dep) {
                var r = DiUtils.bindDep(dep, contextFn);
                return r;
            })
		};

        return result;
    },

    /**
     * Binds a dependency to a given context; called by bindProvider
     */
    bindDep: function(dep, contextFn) {
		var result = angular.extend({}, dep);
        result.fn = DiUtils.bindExpr(dep.expr, contextFn);
        return result;
    },

    bindAssignment: function(assignment, depContextFn, targetContextFn) {
        var result = {
            assignment: assignment,
//            targetExprStr: assignment.targetExprStr
            boundTarget: DiUtils.bindExpr(assignment.targetExpr, targetContextFn || depContextFn),
            boundProvider: DiUtils.bindProvider(assignment.provider, depContextFn)
        };
        return result;
    },

    processProviderSpec: function($parse, spec) {
        var result;

        if(spec.$inject) {
            throw new Error('Not supported yet');
        }
        else if(Array.isArray(spec)) {
            result = DiUtils.processProviderSpecArray($parse, spec);
        }
        else if(spec instanceof Function) {
            // Treat the provider as an identity function that dependends on the given function
            var rephrased = [spec, angular.identity];
            result = DiUtils.processProviderSpecArray($parse, rephrased);
        } else {
            throw new Error('Unknow spec');
        }

        return result;
    },

    processProviderSpecArray: function($parse, spec) {
        var l = spec.length;

        var depSpecs = spec.slice(0, l - 1);
        var fn = spec[l - 1];

        var deps = depSpecs.map(function(depSpec) {
            var r = DiUtils.parseDepSpec($parse, depSpec);
            return r;
        });

        var result = {
            fn: fn,
            deps: deps
        };

        return result;
    },


    /**
     * =depName - deep equality - $watch( ..., true)
     * \@depName - array equality
     * depName - default equality - a == b
     *
     * TODO ?depName - strict equality - a === b
     *
     *
     */
    parseDepSpec: function($parse, depSpec) {
        var result;

        if(angular.isString(depSpec)) {
            var pattern = /(\?)?(=|@)?(.+)/;
            var groups = pattern.exec(depSpec);

            result = {
                expr: $parse(groups[3]),
                optional: groups[1] === '?',
                cmpMode: groups[2] || ''
            };

        } else if(angular.isFunction(depSpec)) {
            // If the argument is a function, it will always be evaluated and
            // the respective value will be passed as an argument to the provider
            result = {
                expr: depSpec,
                optional: true,
                cmpMode: ''
            };
        } else {
            throw new Error('Non-string arguments not yet supported');
        }

        return result;
    }
};



var DynamicDi = function(scope, $parse, $q) {
    this.scope = scope || {};
    this.$parse = $parse;
    this.$q = $q;
    this.attrToProviderCtrl = {};

    var self = this;

    this.contextFn = function() {
        return self.scope;
    };

    this.idToArrayMgr = {};
};

DynamicDi.prototype = {
    linkArray: function(targetArrayExprOrStr, sourceArrayExprOrStr, handlers) {
        var sourceArrayExpr = angular.isString(sourceArrayExprOrStr)
            ? this.$parse(sourceArrayExprOrStr)
            : sourceArrayExprOrStr;

        var targetArrayExpr = angular.isString(targetArrayExprOrStr)
            ? this.$parse(targetArrayExprOrStr)
            : targetArrayExprOrStr;

        var sourceArrayFn = DiUtils.bindExpr(sourceArrayExpr, this.scope);
        var targetArrayFn = DiUtils.bindExpr(targetArrayExpr, this.scope);

        var updateFn = function(sourceArr, before) {
            var targetArr = targetArrayFn();
            if(!targetArr) {
                throw new Error('[dddi] \'' + targetArrayExprOrStr + '\' does not evaluate to an array anymore');
            }

            var l = sourceArr ? sourceArr.length : 0;
            DiUtils.resizeArray(targetArr, l, handlers);
        };

        var targetArr = targetArrayFn();
        if(!targetArr && targetArrayFn.assign) {
            targetArr = [];
            targetArrayFn.assign(targetArr);
        } else {
            throw new Error('[dddi] Error: \'' + targetArrayExprOrStr + '\' does not evaluate to an array, nor is it writable');
        }

        var self = this;
        var result = this.scope.$watchCollection(sourceArrayFn, updateFn);

        var init = sourceArrayFn();
        updateFn(init);

        return result;
    },


    /**
     * The returned object supports registering dddi assignments
     * on arrays: Each assignment is carried out for every array item.
     */
    forArray: function(targetArrayExprOrStr) {
        if(!angular.isString(targetArrayExprOrStr)) {
            throw new Error('Sorry, non-string expressions not supported yet');
        }

        var arrayExpr = this.$parse(targetArrayExprOrStr);
        var arrayFn = DiUtils.bindExpr(arrayExpr, this.contextFn);


        // Check if there already exists a template for that array
        // otherwise create a new one
        var arrayMgr = this.idToArrayMgr[targetArrayExprOrStr];
        if(arrayMgr == null) {
            arrayMgr = new DddiArrayMgr(this, arrayFn, targetArrayExprOrStr);
            this.idToArrayMgr[targetArrayExprOrStr] = arrayMgr;
        }

        return arrayMgr;
    },


    processAssignment: function(targetExprStr, providerSpec) {
        var targetExpr = this.$parse(targetExprStr);
        if(!targetExpr.assign) {
            throw new Error('Target is not writeable: ', targetExprStr, providerSpec);
        }

        var provider = DiUtils.processProviderSpec(this.$parse, providerSpec);

        var result = {
            targetExpr: targetExpr,
            targetExprStr: targetExprStr, // useful for logging
            provider: provider
        };

        return result;
    },
    

    register: function(targetExprStr, providerSpec) {
        var assignment = this.processAssignment(targetExprStr, providerSpec);
        var boundAssignment = this.bindAssignment(assignment);

        var result = this.installBoundAssignment(boundAssignment);

        return result;
    },

    bindAssignment: function(assignment) {
        var result = DiUtils.bindAssignment(assignment, this.contextFn);
        result.targetExprStr = assignment.targetExprStr;
        return result;
    },
/*
    installProvider: function(target, provider, targetExprStr) {
        // Bind target and dependency expressions to the scope


        var result = this.installProvider(target, boundProvider, targetExprStr);
        return result;
    },
*/


    installBoundAssignment: function(boundAssignment) {
        var result = this.installBoundAssignmentCore(boundAssignment.boundTarget, boundAssignment.boundProvider, boundAssignment.targetExprStr);
        return result;
    },

    installBoundAssignmentCore: function(boundTarget, boundProvider, targetExprStr) {
        console.log('[dddi] Watching \'' + targetExprStr + '\'');

        var self = this;
        var deps = boundProvider.deps;


        var runningPromise = null;


        // We explicitly add the non-referenced newValue and old Value attributes
        // so that angular tracks the old value which is useful for debugging
        var doChangeAction = function(newValue, oldValue) {

            // Resolve dependencies to arguments
            var args = deps.map(function(dep) {
//                var r = dep.model(self.scope);
                var r = dep.fn(); // we assume that the dep is bound to a context
                return r;
            });

            // Validate the dependencies (currently limited to null checking)
            // If this step fails, we do not invoke the provider and set the attr to null
            var valid = true;
            for(var i = 0; i < args.length; ++i) {
                var arg = args[i];
                var dep = boundProvider.deps[i];

                if(!dep.optional && arg == null) {
                    valid = false;
                    break;
                }
            }

            // TODO the function should be bound to the context
            var val = valid ? boundProvider.fn.apply(self.scope, args) : null;

            // Cancel any prior promise
            if(runningPromise && runningPromise.cancel) {
                runningPromise.cancel();
            }

            runningPromise = val;

            var success = function(v) {
                if(runningPromise == val) {
                    runningPromise = null;

                    console.log('[dddi] Updating \'' + targetExprStr + '\' with value \'' + v + '\'', v);
//                    target.assign(self.scope, v);
                    boundTarget.assign(v);
                } else {
                    console.log('[dddi] Ignoring \'' + targetExprStr + '\' with value \'' + v + '\'', v);
                }
            };

            var fail = function(e) {
                if(runningPromise == val) {
                    runningPromise = null;

                    console.log('[dddi] Failed \'' + targetExprStr + '\': ', e);
                }
            };

            // Deal with potential promises
            // Note: It seems using $q directly may in some cases delay execution of the handlers even if val is NOT a promise
            // This is undesired, as it causes dependencies needlessly to be resolved out of order
            if(val && val.then) {
                self.$q.when(val).then(success, fail);
            } else {
                success(val);
            }
        };

        // Make the provider take immediate effect
        doChangeAction();

        // Group the watches:
        // none: All reference watches go into an array that will be watched with $watchCollection
        // @:
        // =: All deep watches will go into a function returning a (static) array of all items to be deep watched

        var cmpModeToDeps = {};

        deps.forEach(function(dep) {
            var group = cmpModeToDeps[dep.cmpMode] = cmpModeToDeps[dep.cmpMode] || [];
            group.push(dep);
        });


        /** 
         *Function that returns a watchExpression function.
         * The latter which will on every call return the same array instance,
         * however with updated items
         */
        var createArrFn = function(deps) {
            var arrayFn = function() {
                var r = deps.map(function(dep) {
                    var s = dep.fn();
                    return s;
                });
                return r;
            };
            var result = DiUtils.wrapArrayFn(arrayFn);
            return result;
        };
/*
            var arr = [];

            // Init the array
            for(var i = 0; i < deps.length; ++i) {
                var val = deps[i].fn();
                arr.push(val);
            }

            var result = function() {
                for(var i = 0; i < deps.length; ++i) {
                    var val = deps[i].fn();
                    //arr[i] = model(self.scope);
                    arr[i] = val;
                }
                return arr;
            };

*/

        var cmpModes = Object.keys(cmpModeToDeps);


        var unwatchers = [];
        cmpModes.forEach(function(cmpMode) {
            var group = cmpModeToDeps[cmpMode];

            var unwatcher;
            var fn;

            switch(cmpMode) {
            case '': {
                if(group.length === 1) {
                    unwatcher = self.scope.$watch(group[0].fn, doChangeAction);
                } else {
                    fn = createArrFn(group);
                    unwatcher = self.scope.$watchCollection(fn, doChangeAction);
                }

                unwatchers.push(unwatcher);
                break;
            }

            case '=': {
                if(group.length === 1) {
                    unwatcher = self.scope.$watch(group[0].fn, doChangeAction, true);
                } else {
                    fn = createArrFn(group);
                    unwatcher = self.scope.$watch(fn, doChangeAction, true);
                }

                unwatchers.push(unwatcher);
                break;
            }

            case '@': {
                var uws = group.map(function(dep) {
                    var r = self.scope.$watchCollection(dep.fn, doChangeAction);
                    return r;
                });

                unwatchers.push.apply(unwatchers, uws);
                break;
            }
            default:
                throw new Error('Unsupported watch mode: [' + mode + ']');
            }

        });

        // Wrap each unwatcher with log output
        var result = function() {
            console.log('[dddi] Unwatching \'' + targetExprStr + '\'');
            unwatchers.forEach(function(unwatcher) {
                unwatcher();
            });
        };

        return result;

/*
        // Register all the watchers
        var unwatchFns = deps.map(function(dep) {
            var r = self.watch(self.scope, dep.model, function() {
                doChangeAction();
            }, dep.cmpMode);
            return r;
        });

        var result = unwatchFns;
        return result;
        */
    }
};



/**
 * Object for managing dddi registrations on a specific array
 *
 * dddi.forArray('arrayExpr').register('attr', [exprs, fn])
 *
 *
 *
 *
 * With this array thing, we know which attribute in the items in the array
 * we want to bind.
 */
var DddiArrayMgr = function(dddi, arrayFn, arrayName) {
    this.dddi = dddi;

    this.arrayFn = arrayFn;
    this.arrayName = arrayName; // For logging purposes

    this.assignments = {};

    // Keep track of all watchers associated with an array item
    this.indexToUnwatchers = [];

    this.arrayCache = [];

    this.init();
};


/**
 * Array API for DDDI
 */
DddiArrayMgr.prototype = {
    /**
     * Watch the size of the target array, and dynamically add/remove watchers as needed
     */
    init: function() {
        var self = this;

        // Wrap the original arrayFn such the result array always has the same
        // reference (we are only interested in changes to the items)
        var wrappedArrayFn = DiUtils.wrapArrayFn(this.arrayFn);


        this.dddi.scope.$watchCollection(wrappedArrayFn, function(after, before) {

            // if the target is not an array (anymore), remove all watchers
            if(!angular.isArray(after)) {
                DiUtils.resizeArray(self.arrayCache, 0);
                //self.arrayCache = [];
                self.unwatchAtAll();
            }
            else {
                //self.arrayCache = after;

                DiUtils.resizeArray(self.indexToUnwatchers, after.length, {
                    preCreate: function() {
                        return [];
                    },
                    preDestroy: function(index) {
                        self.unwatchAtIndex(index);
                    }
                });

                DiUtils.resizeArray(self.arrayCache, after.length, {
                    preCreate: function(index) {
                        var r = after[index];
                        return r;
                    },
                    postCreate: function(index) {
                        self.installAllAtIndex(index);
                    }
                });
            }
        });
    },

    /**
     * Register an assignment for an array
     */
    register: function(targetExprStr, providerSpec) {
        var contextFn = function() {
            return this.scope;
        };

        var assignment = this.dddi.processAssignment(targetExprStr, providerSpec);
        //var boundAssignment = this.bindAssignment(


        this.assignments[targetExprStr] = assignment;

        this.installAtAll(assignment);

        // TODO: The result should be a deregistration function
        // which removes all instances of the assignment accross all array elements

        return null;
    },

    /**
     * Binds an assignment to a certain array index
     */
    bindAssignment: function(index, assignment) {
        var self = this;

        var depContextFn = function() {
            var data = self.arrayCache ? self.arrayCache[index] : null;
            var r = angular.extend({}, data);

            r.$scope = self.dddi.scope;
            r.$index = index;

            return r;
        };

        var targetContextFn = function() {
           var arr = self.arrayFn();
           var r = arr[index];

//           var r = self.arrayCache[index];
           return r;
        };

        var result = DiUtils.bindAssignment(assignment, depContextFn, targetContextFn);
        result.targetExprStr = this.arrayName + '[' + index + '].' + assignment.targetExprStr;

        return result;
    },

    installAtAll: function(assignment) {
        // Install the assignment on all current array elements
        var l = this.arrayCache ? this.arrayCache.length : 0;
        for(var i = 0; i < l; ++i) {
            this.installAtIndex(i);
//            var boundAssignment = this.bindAssignment(i, assignment);
//            this.dddi.installBoundAssignment(boundAssignment);
        }
    },

    installAllAtIndex: function(index) {
        var self = this;

		var keys = Object.keys(this.assignments);
        keys.forEach(function(key) {
            var assignment = self.assignments[key];
            self.installAtIndex(index, assignment);
        });
    },

    installAtIndex: function(index, assignment) {
        var boundAssignment = this.bindAssignment(index, assignment);
        var unwatcher = this.dddi.installBoundAssignment(boundAssignment);
        this.indexToUnwatchers[index].push(unwatcher);
    },

    /**
     *
     */
    unwatchAtAll: function() {
        this.indexToUnwatchers.forEach(function(unwatchers) {
            unwatchers.forEach(function(unwatcher) {
                unwatcher();
            });
        });
    },

    unwatchAtIndex: function(index) {
        var unwatchers = this.indexToUnwatchers[index];
        unwatchers.forEach(function(unwatcher) {
            unwatcher();
        });
    }
};


/**
 * Dependency: {
 *     model: 'string',
 *     optional: 'boolean'
 * }
 *
 * Provider: {
 *     fn: 'function',
 *     deps: 'Dependency[]'
 * }
 *
 *
 * angular.controller('myCtrl', [ '$scope', '$dddi', function($scope, $dddi) {
 *     var dddi = new $dddi($scope);
 * }]);
 */
angular.module('dddi', [])

.service('$dddi', [ '$parse', '$q', function($parse, $q) {

    // We partially bind a DynamicDi instance to the $parse service,
    var result = function(scope) {
        var r = new DynamicDi(scope, $parse, $q);
        return r;
    };

    // Expose utils
    result.utils = DiUtils;

    return result;
}]);




})();


