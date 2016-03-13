#Feature Catalog Selector

This app presents a catalog of features (lowest level portfolio items) available to copy to a parent portfolio item in bulk.

![ScreenShot](/images/feature-catalog.png)  
  
The scenario for this app is that an ancestor portfolio item contains a hierarchy of "template" portfolio items that are commonly 
used.  

If the ancestor portfolio item is more than 2 levels above the lowest level portfolio item, then a dropdown box will be available 
above the grid with children chosen PI to filter features to those descended from the 3rd level portfolio selected in the 
dropdown.  

The grid of available features to be copied will be grouped by their parent portfolio items.

This app provides a way to select and copy those items in bulk to a new parent.  

To copy features to a parent, select the feature(s) to copy, right click on the gear and select Copy to Parent....

A copy of the selected feature(s) and all child stories and tasks will be copied to the selected parent.  

If a feature or any of its children fail to copy, the app will attempt to "cleanup" the copied feature by deleting all artifacts 
within that feature that were successfully copied during the transaction.

###App Configuration

Configurations to copy the "template" feature, initiative and theme ID are at the top.  Select a custom field to store the template IDs in the copied feature.  

A parent/grandparent/great-grandparent portfolio item is configured in the app settings.  This portfolio item contains all template
portfolio items below it.  The lowest level portfolio items are available for copy to a parent.  The mid-level portfolio items 
are used as means to organize and browse the catalog.  

![ScreenShot](/images/feature-catalog-settings.png)


## Development Notes

The Capability / Feature / Sub-Feature fields  hold template IDs.  It’s just info, the app
doesn’t care.  Each should be a string field.


### First Load

If you've just downloaded this from github and you want to do development, 
you're going to need to have these installed:

 * node.js
 * grunt-cli
 * grunt-init
 
Since you're getting this from github, we assume you have the command line
version of git also installed.  If not, go get git.

If you have those three installed, just type this in the root directory here
to get set up to develop:

  npm install

### Structure

  * src/javascript:  All the JS files saved here will be compiled into the 
  target html file
  * src/style: All of the stylesheets saved here will be compiled into the 
  target html file
  * test/fast: Fast jasmine tests go here.  There should also be a helper 
  file that is loaded first for creating mocks and doing other shortcuts
  (fastHelper.js) **Tests should be in a file named <something>-spec.js**
  * test/slow: Slow jasmine tests go here.  There should also be a helper
  file that is loaded first for creating mocks and doing other shortcuts 
  (slowHelper.js) **Tests should be in a file named <something>-spec.js**
  * templates: This is where templates that are used to create the production
  and debug html files live.  The advantage of using these templates is that
  you can configure the behavior of the html around the JS.
  * config.json: This file contains the configuration settings necessary to
  create the debug and production html files.  Server is only used for debug,
  name, className and sdk are used for both.
  * package.json: This file lists the dependencies for grunt
  * auth.json: This file should NOT be checked in.  Create this to run the
  slow test specs.  It should look like:
    {
        "username":"you@company.com",
        "password":"secret"
    }
  
### Usage of the grunt file
####Tasks
    
##### grunt debug

Use grunt debug to create the debug html file.  You only need to run this when you have added new files to
the src directories.

##### grunt build

Use grunt build to create the production html file.  We still have to copy the html file to a panel to test.

##### grunt test-fast

Use grunt test-fast to run the Jasmine tests in the fast directory.  Typically, the tests in the fast 
directory are more pure unit tests and do not need to connect to Rally.

##### grunt test-slow

Use grunt test-slow to run the Jasmine tests in the slow directory.  Typically, the tests in the slow
directory are more like integration tests in that they require connecting to Rally and interacting with
data.
