# DDDI-Angular

A lightweight angular service for Data Driven Dependency Injection.
"Data Driven" refers to the fact that dependencies are expressions over an angular scope, which get dynamically re-computed whenever changes in their state (i.e. the data) occurr.
Technically, this project can be seen as a convenience wrapper around angular's $watch mechanism, with the purpose to wire up the value of a target model with a set of source models via some computation function.
If that function returns a promise, the target value is set once it resolves. In this case, while the promise is running, the targets current value is retained. A failed promise is treated as having resolved to null.

## Bower.json dependency
{
  "name": "your-app",
  "version": "0.0.1",
  "dependencies": {
    "dddi-angular": "1.0.0"
  }
}

## Example
```js
angular

// Include the sbdi module
.module('MyModule', ['dddi'])

// Reference the $sbdi service
.controller('MyCtrl', ['$scope', '$dddi', function($scope, $sbdi) {
    $scope.serviceIri = 'http://dbpedia.org/sparql';
    $scope.defaultGraphIris = ['http://dbpedia.org'];

    var dddi = $dddi($scope);

    // Register a dependency for $scope.sparqlService
    var deregisterFn = dddi.register('sparqlService', [ 'serviceIri', '?defaultGraphIris',
        function(serviceIri, defaultGraphIris) {
            return someSparqlServiceObjectBasedOn(serviceIri, defaultGraphIris);
        }]);
        
    // Call the deregister function to stop reacting to state changes of respective dependencies
    deregisterFn();
}])

;
```

### Dependency syntax:
[modality] [watchMode] [expr]

* The modality refers to whether a dependency is optional or mandatory. By default, dependencies are mandatory, which means that they must not refer to a falsy value. The factory function will not be invoked if dependencies are not satisfied, and the target will be set to null. Use '?' to mark the dependency as optional.
* The watchMode refers to which of angular's watch mechanisms should be used for the dependency.

   * @ : Collection watch, $watchCollection will be used.
   * = : Deep equality, $watch(..., true) will be used.
   * (none) : Reference equality, $watch(...) will be used.

* expr is simply an angular expression

