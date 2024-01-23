const Sequelize = require('sequelize')
      envVariables = require('../envVariables')
      path = require('path')
      fs = require('fs');
      basename  = path.basename(module.filename);

const HelperService = require('../helpers/helperService');

var db = {};
var sequelize = new Sequelize(envVariables.config.database, envVariables.config.user, envVariables.config.password, envVariables.config);

logger.info("host => ", envVariables.config.host);
logger.info("database => ", envVariables.config.database);
logger.info("user => ", envVariables.config.user);
logger.info("password => ", envVariables.config.password);

fs.readdirSync(__dirname)
  .filter(function(file) {
    return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js');
  })
  .forEach(function(file) {
    var model = sequelize['import'](path.join(__dirname, file));
    db[model.name] = model;
  });

db.sequelize = sequelize;
db.Sequelize = Sequelize;

db.program.hasMany(db.nomination, {foreignKey: 'program_id'});
db.nomination.belongsTo(db.program, {foreignKey: 'program_id'});

HelperService.AttachModelHooks(db);

module.exports = db;
