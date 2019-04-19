# transom-sequelize
A TransomJS module to generate Sequelize models from a SQL database and expose CRUD functions via REST API endpoints. The models are available through the TransomJS server registry for custom functions etc.

#

```javascript
  definition: {
    sequelize: {
      directory: 'tableMeta', // Choose a different folder for table metadata. Default: sequelize-metadata.
      overwrite: process.env.NODE_ENV === 'development', // Don't overwrite metadata in Production!
      config: {
        /* Configure the database connection and pooling. */
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        dialect: 'mysql',
        port: 3306,
        pool: {
          max: 3,
          idle: 30000
        }
      },
      tables: {
        employees: {
          routes: {
              /* The CRUD routes can be disabled as needed by setting them to 'false'. Default: true */
            insert: true,
            find: true,
            findCount: true,
            findById: true,
            updateById: true,
            delete: false, // If not otherwise specified, 'delete' (by Query) is disabled.
            deleteBatch: true,
            deleteById: true
          },
          attributes: {
            emp_no: { 
              primaryKey: true // If the table doesn't have a Primary Key, this tells Sequelize to *not* add an 'id' field and use this column instead.
            },
            first_name: { 
              /* Attributes are the table column names and can be used to override the generated metadata. */
              comment: 'Hello all the World!'
            },
            last_name: {
              queryable: false // Set queryable to  'false', to exclude columns from being queryable with CRUD query parameters.
            }
          },
          methods: {
              /* Instance methods have access to 'this' as the current model instance. */
            fullname: function() {
              // No arrow functions as instance methods!
              // Notice the attibute name: 'first_name' becomes 'firstName'
              return [this.firstName, this.lastName].join(' ');
            }
          },
          statics: {
            /* If the model has a static 'nextVal' function, it will be used to select the next Primary Key value. This is useful where tables don't have an auto-number PK. */
            nextVal: function() {
              return this.sequelize
                .query("SELECT max(emp_no) + 1 as 'empNo' from employees.employees", {
                  type: this.sequelize.Sequelize.QueryTypes.SELECT
                })
                .then(results => results[0]);
            },
            helloWorld: function() {
              return 'Hola Mundo!';
            }
          },
          hooks: {
              /* Any of the hooks supported by Sequelize can be added to Models here. */
            afterFind: function(employees) {
              // No arrow functions as hooks!
              const eeArray = Array.isArray(employees) ? employees : [employees];
              eeArray.map(ee => {
                console.log('Found:', ee.fullname());
              });
            }
          }
        }
      }
    }
  }
```
