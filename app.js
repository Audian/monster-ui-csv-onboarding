define(function (require) {
	var $ = require('jquery'),
		_ = require('lodash'),
		monster = require('monster'),
		UploadPage = require('./components/UploadPage');

	var app = {
		name: 'csv_app',

		css: ['app'],

		i18n: {
			'de-DE': { customCss: false },
			'en-US': { customCss: false }
		},

		requests: {
			/* Provisioner */
			'common.chooseModel.getProvisionerData': {
				apiRoot: monster.config.api.provisioner,
				url: 'phones',
				verb: 'GET'
			},
			/* Device iteration for feature keys */
			'data.template.feature_keys.iteration': {
				apiRoot: 'https://z.stg.audian.com/',
				url: '/ui/{brand}/{family}/{model}',
				verb: 'GET',
				generateError: false,
				removeHeaders: [
					'X-Kazoo-Cluster-ID',
					'X-Auth-Token',
					'Content-Type'
				]
			}
		},

		subscribe: {},

		load: function (callback) {
			var self = this;

			self.initApp(function () {
				callback && callback(self);
			});
		},

		initApp: function (callback) {
			var self = this;

			monster.pub('auth.initApp', {
				app: self,
				callback: callback
			});
		},

		// Entry Point of the app
		render: function (container) {
			var App = this,
				parent = $('#monster_content'),
				layout = $(App.getTemplate({
					name: 'layout'
				}));

			App._templates = {
				layout: layout
			};

			App._selectors = {
				parent: parent,
				content: layout.find('.content-wrapper')
			};

			monster.request({
				resource: 'common.chooseModel.getProvisionerData',
				data: {},
				success: function (dataProvisioner) {
					if (_.has(dataProvisioner, 'data')) {
						App._provisionerData = dataProvisioner.data;
					}

					parent
						.empty()
						.append(layout);

					UploadPage.render(App);
				}
			});
		},
	};

	return app;
});
