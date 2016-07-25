var gulp = require('gulp');
var bower = require('gulp-bower');
var concat = require('gulp-concat');

var bower_files = [
    //'bower_components/jquery/dist/jquery.min.js',
    'bower_components/angular/angular.min.js',
    'bower_components/angular-route/angular-route.min.js',
    'bower_components/angular-amplitude/angular-amplitude.js',
    'bower_components/underscore/underscore-min.js',
    //'bower_components/d3/d3.min.js',
    //'bower_components/bootstrap/dist/js/bootstrap.min.js',
    //'client/js/blob-ng.js'
    ];
    
var outputname = 'kappa';
var outputdir = './client/static';

gulp.task('default', function() {
    return gulp.src(bower_files)
        .pipe(concat({ path: outputname + '.js' }))
        .pipe(gulp.dest(outputdir));
});