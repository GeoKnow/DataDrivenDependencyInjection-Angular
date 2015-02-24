# Statebased-DI-Angular (Documentation is Work in Progress)

A lightweight angular service for state based dependency injection.
"State-based" refers to the fact that dependencies are expressions over an angular scope, which get dynamically re-computed whenever changes in their state occurr.
Technically, this project can be seen as a convenience wrapper around angular's $watch mechanism, with the purpose to wire up the value of a target model with a set of source models via some computation function.
If that function returns a promise, the target value is set once it resolves. In this case, while the promise is running, the targets current value is retained.

## Example
```js
angular.controller('MyCtrl', [ '$scope', '$sbdi', function($scope, $bsdi) {
    $scope.serviceIri = 'http://dbpedia.org/sparql';
    $scope.defaultGraphIris = ['http://dbpedia.org];

    var sbdi = $bsdi($scope);

    sbdi.register('sparqlService', [ 'serviceIri', '?defaultGraphIris',
        function(serviceIri, defaultGraphIris) {
            return someSparqlServiceObjectBasedOn(serviceIri, defaultGraphIris);
        }]);
}]);
```

### Dependency syntax:
[modality] [watchMode] [expr]

* The modality refers to whether a dependency is optional or mandatory. By default, dependencies are mandatory, which means that they must not refer to a falsy value. The factory function will not be invoked if dependencies are not satisfied, and the target will be set to null. Use '?' to mark the dependency as optional.
* The watchMode refers to which of angular's watch mechanisms should be used for the dependency.

   * @ : Collection watch, $watchCollection will be used.
   * = : Deep equality, $watch(..., true) will be used.
   * (none) : Reference equality, $watch(...) will be used.

* expr is simply an angular expression

