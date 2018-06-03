import os, shutil

from invoke import task, Exit 
from patchwork.transfers import rsync
from fabric import Connection

path = os.path.join

SRV_PATH = '/srv/www/kappa/'

linode = Connection('linode')

@task
def deploy_client(c):
    exclude = ['node_modules/*', 'about.html', 'd3.html']
    srcdir = path(os.getcwd(), 'client/')
    destdir = path(SRV_PATH, 'client')

    rsync(linode, srcdir, destdir, exclude=exclude)

    with linode.cd(destdir):
        linode.run('npm install --silent')

@task
def deploy_server(c):
    # update folder except client/ dir
    # symlink should have worked
    # npm update
    # restart nginx/supervisor whatever
    include = ['server.js', 'package.json', 'package-lock.json']
    tmpdir = path(os.getcwd(), 'tmp/')

    # mv to tmp
    os.makedirs(tmpdir, exist_ok=True)
    for file in include:
        shutil.copy(file, tmpdir)

    rsync(linode, tmpdir, SRV_PATH)

    # run npm install
    with linode.cd(SRV_PATH):
        linode.run('npm install --silent')

    shutil.rmtree(tmpdir)

@task
def deploy(c):
    deploy_client(c)
    deploy_server(c)

@task 
def start(c):
    linode.run('supervisorctl restart kappa')
