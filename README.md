# DDDI-Angular

A lightweight angular service for Data Driven Dependency Injection.

# Introduction
In any slightly sophisticated Web applications there are components that depend on each other's state.
For example, when doing a meshup you may have a configuration object with URLs pointing to services having certain APIs hosted somewhere on the Web (e.g. Nominatim Geocode services or SparqlEndpoints). Now, if for example your application needs to geocode an address string, you don't want your application layer to deal with the details of how to construct the URIs - instead, based on the configuration, you want to create a simple service wrapper around it, which for instance has a 'Promise geocode(String addressString)' method.
Now there are two common problems:
First, when changing the config url (e.g. in order to use the Nominatim of MapQuest rather than that of OpenStreetMap) you want your service to update.
Second: There may be other components of your application that build upon the geocoding service and thus need to be updated as well.

Enter DDDI.

Data Driven" refers to the fact that dependencies are expressions over an angular scope, which get dynamically re-computed whenever changes in their state (i.e. the data) occurr.
Technically, this project can be seen as a (rather small) convenience wrapper around angular's $watch mechanism, with the purpose to wire up the value of a target model with a set of source models via some computation function.
If that function returns a promise, the target value is set once it resolves. In this case, while the promise is running, the targets current value is retained. A failed promise is treated as having resolved to null.

## Bower.json dependency
```js
{
  "name": "your-app",
  "version": "0.0.1",
  "dependencies": {
    "dddi-angular": "1.0.0"
  }
}
```

## Example
```js
// Note: Since not many ppl know what a sparql endpoint is, at some point I'll update this example
// for geocoding which is much more popular - But the principle is the same ;)

angular

// Include the dddi module
.module('MyModule', ['dddi'])

// Reference the $dddi service
.controller('MyCtrl', ['$scope', '$dddi', function($scope, $dddi) {
    $scope.serviceIri = 'http://dbpedia.org/sparql';
    $scope.defaultGraphIris = ['http://dbpedia.org'];

    var dddi = $dddi($scope);

    // Register a dependency for $scope.sparqlService
    dddi.register('sparqlService', [ 'serviceIri', '?@defaultGraphIris',
        function(serviceIri, defaultGraphIris) {
            return someSparqlServiceObjectBasedOn(serviceIri, defaultGraphIris);
        }]);
        

    // Now lets create a utility function that
    // returns labels for URI based on the sparqlService
    var deregisterFn = dddi.register('labelLookupService', [ 'sparqlService',
        function(sparqlService) {
            return function(uri) {
                var promise = someFunctionThatFetchesTheLabelsForTheUri(sparqlService, uri);
                return promise;
            };
        }]);
    
    // Note: Call the deregister function to stop reacting to state changes of respective dependencies
    // deregisterFn();

}])

;
```

In the example below, clicking the button will update sparqlService and labelLookupServicebecause they depend on the state of serviceIri.
This way, refreshing complex dependencies between components of an application *as needed* becomes a breeze:
The assumption is, that if for a service there is no state change in any of its dependencies, then there is no need to re-create the service.

```html
<input type="text" ng-model="iri">
<button ng-click="serviceIri=iri">Magic happens when you click me</Button>
```

### Dependency syntax:
[modality] [watchMode] [expr]

* The modality refers to whether a dependency is optional or mandatory. By default, dependencies are mandatory, which means that they must not refer to a falsy value. The factory function will not be invoked if dependencies are not satisfied, and the target will be set to null. Use '?' to mark the dependency as optional.
* The watchMode refers to which of angular's watch mechanisms should be used for the dependency.

   * @ : Collection watch, $watchCollection will be used.
   * = : Deep equality, $watch(..., true) will be used.
   * (none) : Reference equality, $watch(...) will be used.

* expr is simply an angular expression

